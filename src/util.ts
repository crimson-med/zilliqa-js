// Copyright (c) 2018 Zilliqa
// This source code is being disclosed to you solely for the purpose of your participation in
// testing Zilliqa. You may view, compile and run the code for that purpose and pursuant to
// the protocols and algorithms that are programmed into, and intended by, the code. You may
// not do anything else with the code without express permission from Zilliqa Research Pte. Ltd.,
// including modifying or publishing the code (or any part of it), and developing or forming
// another public or private blockchain network. This source code is provided ‘as is’ and no
// warranties are given as to title or non-infringement, merchantability or fitness for purpose
// and, to the extent permitted by law, all liability for your use of the code is disclaimed.
import elliptic from 'elliptic';
import sha256 from 'crypto-js/sha256';
import {isWebUri} from 'valid-url';
import * as schnorr from './schnorr';

const NUM_BYTES = 32;
const HEX_PREFIX = '0x';

const secp256k1 = elliptic.ec('secp256k1').curve;

const hasCrypto = () => {
  if (
    typeof window !== 'undefined' &&
    window.crypto &&
    window.crypto.getRandomValues
  ) {
    return true;
  }

  return false;
};

/**
 * generatePrivateKey
 *
 * @returns {string} - the hex-encoded private key
 */
export const generatePrivateKey = (): string => {
  if (!hasCrypto()) {
    throw new Error(
      'This browser is not capable of safely generating random numbers.',
    );
  }

  let priv = HEX_PREFIX;
  const rand = new Uint8Array(NUM_BYTES);
  window.crypto.getRandomValues(rand);

  for (let i = 0; i < rand.byteLength; i++) {
    // add 00 in case we get an empty byte.
    const byte = rand[i];
    const hexstr = '00'.concat(byte.toString(16)).slice(-2);
    priv += hexstr;
  }

  return priv;
};

/**
 * getAddressFromPrivateKey
 *
 * takes a hex-encoded string (private key) and returns its corresponding
 * 20-byte hex-encoded address.
 *
 * @param {string} Key
 * @returns {string}
 */
export const getAddressFromPrivateKey = (privateKey: string) => {
  const keyPair = secp256k1.keyFromPrivate(privateKey, 'hex');
  const pub = keyPair.getPublic(false, 'hex');

  return sha256(pub).slice(0, 20);
};

/**
 * getPubKeyFromPrivateKey
 *
 * takes a hex-encoded string (private key) and returns its corresponding
 * hex-encoded 32-byte public key.
 *
 * @param {string} privateKey
 * @returns {string}
 */
export const getPubKeyFromPrivateKey = (privateKey: string) => {
  const keyPair = secp256k1.keyFromPrivate(privateKey, 'hex');
  return keyPair.getPublic(false, 'hex');
};

/**
 * getAddressFromPublicKey
 *
 * takes hex-encoded string and returns the corresponding address
 *
 * @param {string} pubKey
 * @returns {string}
 */
export const getAddressFromPublicKey = (pubKey: string) => {
  const hash = sha256(pubKey); // sha256 hash of the public key

  return hash.toString('hex', 12); // rightmost 160 bits/20 bytes of the hash
};

/**
 * verifyPrivateKey
 *
 * @param {string|Buffer} privateKey
 * @returns {boolean}
 */
export const verifyPrivateKey = (privateKey: string): boolean => {
  const keyPair = secp256k1.keyFromPrivate(privateKey, 'hex');
  const {result} = keyPair.validate();
  return result;
};

// construct the transaction json
// input the privateKey and transaction object
export const createTransactionJson = (privateKey: string, txnDetails: any) => {
  const pubKey = secp256k1
    .keyFromPrivate(privateKey, 'hex')
    .getPublic(false, 'hex');

  let txn = {
    version: txnDetails.version,
    nonce: txnDetails.nonce,
    to: txnDetails.to,
    amount: txnDetails.amount,
    pubKey,
    gasPrice: txnDetails.gasPrice,
    gasLimit: txnDetails.gasLimit,
    code: txnDetails.code || '',
    data: txnDetails.data || '',
  };

  let codeHex = new Buffer(txn.code).toString('hex');
  let dataHex = new Buffer(txn.data).toString('hex');

  let msg =
    intToByteArray(txn.version, 64).join('') +
    intToByteArray(txn.nonce, 64).join('') +
    txn.to +
    txn.pubKey +
    intToByteArray(txn.amount, 64).join('') +
    intToByteArray(txn.gasPrice, 64).join('') +
    intToByteArray(txn.gasLimit, 64).join('') +
    intToByteArray(txn.code.length, 8).join('') + // size of code
    codeHex +
    intToByteArray(txn.data.length, 8).join('') + // size of data
    dataHex;

  // sign using schnorr lib
  let sig = schnorr.sign(
    new Buffer(msg, 'hex'),
    new Buffer(privateKey, 'hex'),
    new Buffer(pubKey, 'hex'),
  );

  let r = sig.r.toString('hex');
  let s = sig.s.toString('hex');
  while (r.length < 64) {
    r = '0' + r;
  }
  while (s.length < 64) {
    s = '0' + s;
  }
  txn['signature'] = r + s;

  return txn;
};

interface ValidatorDictionary {
  [key: string]: Array<(...args: any[]) => any>;
}

// make sure each of the keys in requiredArgs is present in args
// and each of it's validator functions return true
export const validateArgs = (
  args: { [key: string]: any },
  requiredArgs: ValidatorDictionary,
  optionalArgs?: ValidatorDictionary,
) => {
  for (var key in requiredArgs) {
    if (args[key] === undefined) throw new Error('Key not found: ' + key);

    for (var i = 0; i < requiredArgs[key].length; i++) {
      if (typeof requiredArgs[key][i] != 'function')
        throw new Error('Validator is not a function');

      if (!requiredArgs[key][i](args[key]))
        throw new Error('Validation failed for ' + key);
    }
  }

  if (optionalArgs) {
    for (var key in optionalArgs) {
      if (args[key]) {
        for (var i = 0; i < optionalArgs[key].length; i++) {
          if (typeof optionalArgs[key][i] != 'function')
            throw new Error('Validator is not a function');

          if (!optionalArgs[key][i](args[key]))
            throw new Error('Validation failed for ' + key);
        }
      }
    }
  }

  return true;
};

export const isAddress = (address: string) => {
  return !!address.match(/^[0-9a-fA-F]{40}$/);
};

export const isPrivateKey = (privateKey: string) => {
  return !!privateKey.match(/^[0-9a-fA-F]{64}$/);
};

export const isPubkey = (pubKey: string) => {
  return !!pubKey.match(/^[0-9a-fA-F]{66}$/);
};

export const isUrl = url => {
  return isWebUri(url);
};

export const isHash = (txHash: string) => {
  return !!txHash.match(/^[0-9a-fA-F]{64}$/);
};

export const isNumber = (number: any) => {
  return typeof number == 'number';
};

export const isString = (string: any) => {
  return typeof string == 'string';
};

// convert number to array representing the padded hex form
export const intToByteArray = (val: number, paddedSize: number) => {
  const arr: string[] = [];

  let hexVal = val.toString(16);
  let hexRep: string[] = [];

  for (let i = 0; i < hexVal.length; i++) {
    hexRep[i] = hexVal[i].toString();
  }

  for (let i = 0; i < paddedSize - hexVal.length; i++) {
    arr.push('0');
  }

  for (let i = 0; i < hexVal.length; i++) {
    arr.push(hexRep[i]);
  }

  return arr;
};

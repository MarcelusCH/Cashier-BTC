/**
* ==============================================================================
* BTCz-Pay
* ==============================================================================
*
* Version 0.2.0 (production v1.0)
*
* Self-hosted bitcoinZ payment gateway
* https://github.com/MarcelusCH/BTCz-Pay
*
* ------------------------------------------------------------------------------
* storage.js                                         Required by other processes
* ------------------------------------------------------------------------------
*
* This file define the storage call functions.
*
* ==============================================================================
*/


let config = require('../config')
let rp = require('request-promise')


exports.saveDocumentPromise = function (body) {
  return new Promise(function (resolve, reject) {
    rp.post(config.couchdb, { json: body },
      function (error, response, body) {
      if (error) {
        return reject(body)
      }
      return resolve(response.body)
    })
  })
}

// Get a document entry by id
exports.getDocumentPromise = function (_id) {
  return new Promise(function (resolve, reject) {
    rp.get(config.couchdb + '/' + _id, function (error, response, body) {
      if (error) {return reject(error)}
      resolve(JSON.parse(body))
    })
  })
}

exports.getSellerPromise = function (sellerId) {
  return new Promise(function (resolve, reject) {
    rp.get(config.couchdb + '/' + sellerId,
      function (error, response, body) {
      if (error) {
        return reject(error)
      }

      return resolve(JSON.parse(body))
    })
  })
}

exports.saveAddressPromise = function (body) {
  return new Promise(function (resolve, reject) {
    rp.post(config.couchdb, { json: body },
      function (error, response, body) {
      if (error) {
        return reject(body)
      }
      return resolve(response.body)
    })
  })
}

exports.savePayoutPromise = function (body) {
  return new Promise(function (resolve, reject) {
    rp.post(config.couchdb, { json: body },
      function (error, response, body) {
      if (error) {
        return reject(body)
      } else {
        return resolve(response.body)
      }
    })
  })
}

exports.saveSellerPromise = function (sellerId, data) {
  return new Promise(function (resolve, reject) {
    rp.post(config.couchdb, { json: data },
      function (error, response, body) {
      if (error) {
        return reject(body)
      }
      return resolve(response.body)
    })
  })
}

exports.getUnCheckedAdressesNewerThanPromise = function (timestamp) {
  return rp.get({url: config.couchdb +
    '/_design/address/_view/unchecked_return_by_timestamp?startkey=' + timestamp +
    '&inclusive_end=true&limit=10000&reduce=false&include_docs=true',
    json: true})
}

exports.getUnprocessedAdressesNewerThanPromise = function (timestamp) {
  return rp.get({url: config.couchdb +
    '/_design/address/_view/unprocessed_by_timestamp?startkey=' + timestamp +
    '&inclusive_end=true&limit=10000&reduce=false&include_docs=true',
    json: true})
}

exports.getPaidAdressesNewerThanPromise = function (timestamp) {
  return rp.get({url: config.couchdb +
    '/_design/address/_view/paid_by_timestamp?startkey=' + timestamp +
    '&inclusive_end=true&limit=10000&reduce=false&include_docs=true',
    json: true})
}

exports.getPaidUnconfirmedAdressesNewerThanPromise = function (timestamp) {
  return rp.get({url: config.couchdb +
    '/_design/address/_view/paid_unconfirmed_by_timestamp?startkey='
    + timestamp +
    '&inclusive_end=true&limit=10000&reduce=false&include_docs=true',
    json: true})
}

exports.saveJobResultsPromise = function (json) {
  return rp.put(config.couchdb + '/' + json._id, { 'json': json })
}

exports.CountGateway = function () {
  return rp.get(config.couchdb + '/_design/stats/_view/all_customer')
}

exports.CountGatewayExpired = function () {
  return rp.get(config.couchdb +
    '/_design/stats/_view/all_customer_state_expired')
}

exports.CountGatewayPaid = function () {
  return rp.get(config.couchdb +
    '/_design/stats/_view/all_customer_state_paid')
}

// Get all open gateway by the IP
exports.CountGatewayOpenByIP = function (ClientIP) {
  return rp.get({url: config.couchdb +
    '/_design/gateway/_view/all_gateway_open_by_ip?key="'
    + ClientIP + '"',
    json: true})
}


exports.CheckIfAddressExist = function (address) {
  return rp.get({url: config.couchdb +
    '/_design/address/_view/Check_if_address_exist?key="'
    + address + '"',
    json: true})
}

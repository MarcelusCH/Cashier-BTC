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
* worker5.js                                           Independent nodejs worker
* ------------------------------------------------------------------------------
*
* worker iterates all 15 min. through all addresses,
* get unchecked for return found
* if partially or more paid.
*
* ==============================================================================
*/

let storage = require('./models/storage')       // Load db call functions
let blockchain = require('./models/blockchain') // Load blockchain functions
let config = require('./config')                // Load configuration file
let logger = require('./utils/logger')          // Load the logger module
let signer = require('./models/signer')
require('./smoke-test')                         // Checking DB & BtcZ node RPC

;(async () => {
  while (1) {
    let wait = ms => new Promise(resolve => setTimeout(resolve, ms))
    let job = await storage.getUnCheckedAdressesNewerThanPromise(Date.now() - (config.process_paid_for_period*100000))
    await processJob(job)
    await wait(15*59100)
  }
})()

async function processJob (rows) {
  try {

    console.log('worker5.js', ['Check for return founds...'])

    rows = rows || {}
    rows.rows = rows.rows || []

    for (const row of rows.rows) {
      let json = row.doc

      // If paid or expired (only if more that expired time + time in config)
      if ((json.state==2 || json.state==5) && (json.timestamp+(config.max_payment_valid*60000)+(config.check_return*60000))<=Date.now()) {


        let address = json.address

        // Get the unspent total amount
        let unspent = await blockchain.listunspent(address)
        let TotUnspent = 0
        for (value of unspent.result){
          TotUnspent += value.amount
        }

        // Continue if TotUnspent is > 0
        if (TotUnspent>0) {

          // log
          logger.log('worker5.js', [json._id, ''
              +'total unspent: '+TotUnspent, ''
              +'address: '+address])

          // Get the transactions of the address
          let transactions = await blockchain.listTransactions(address)

          // Check the first transaction
          if (transactions.result[0] != undefined){

            // Get the first TXID and decode raw hex (to go back in block)
            let transaction = await blockchain.getRawTransaction(transactions.result[0].txid)
            let decodeRaw = await blockchain.decodeRawTransaction(transaction.result)


            // more test for Z addresses
            if (decodeRaw != undefined && decodeRaw.result.vin[0] != undefined) {



              // Get the VIN TXID and decode the hex
              let RawTransactionVin = await blockchain.getRawTransaction(decodeRaw.result.vin[0].txid)
              let decodeRawTransactionVin = await blockchain.decodeRawTransaction(RawTransactionVin.result)

              // Check if it's not a local address
              let returnAddress = ""
              for (let value of decodeRawTransactionVin.result.vout) {

                  let retAddressTmp = value.scriptPubKey.addresses[0]
                  let gatewayByAddress = await storage.CheckIfAddressExist(retAddressTmp)
                  let AddressInDB=gatewayByAddress.rows.length //-gatewayByAddress.offset

                  // if not in DB, asign it to return address
                  if (AddressInDB==0){
                    returnAddress=retAddressTmp
                    break
                  }
              }

              // log
              logger.log('worker5.js', [json._id, ''
                  +'refound amount: '+TotUnspent, ''
                  +'from: '+address, 'to: '+returnAddress])

              // List unspent and create tx
              let unspentOutputs = await blockchain.listunspent(address)
              let createTx = signer.createTransaction
              let tx = createTx(unspentOutputs.result, returnAddress, TotUnspent, config.fee_tx, json.WIF)

              // broadcasting
              logger.log('worker5.js', [json._id, 'Broadcasting tx: ', tx ])
              let broadcastResult = await blockchain.broadcastTransaction(tx)

              // Log an store result
              json.return_check = 'checked'
              json.sweep_return_result = json.sweep_return_result || {}
              json.sweep_return_result[Date.now()] = {
                'tx': tx,
                'broadcast': broadcastResult
              }
              logger.log('worker5.js', [json._id, 'Store result: ', JSON.stringify(broadcastResult) ])
              await storage.saveJobResultsPromise(json)


            }

          } // end if/else transactions.result[0] == undefined


        } else  {

          // If nothing to return, log an store result
          json.return_check = 'checked'
          logger.log('worker5.js', [json._id, 'Nothing to return.','address : '+address ])
          await storage.saveJobResultsPromise(json)

        }// end if/else unspent > 0
      } // end if state==2 or 5
    } // end for

  } catch (error) {
    logger.error('worker5.js', [ error.message, error.stack ])
  }
}

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
* website.js                                             Required by btcz-pay.js
* ------------------------------------------------------------------------------
*
* Handles the bitcoinZ website pages requests
* I.e. the requests for invoicing templates page,
* the FAQ page, the index page or the qr code generating page.
*
* ==============================================================================
*/


let express = require('express')
let router = express.Router()
let qr = require('qr-image')
let crypto = require('crypto')
let fs = require('fs')
let path = require('path');
let app = express();
let config = require('../config');
let nodemailer = require('nodemailer');
let logger = require('../utils/logger');
let rp = require('request-promise');


// Route for QR generating
router.get('/generate_qr/:text', function (req, res) {
  let filename
  let qrSvg
  filename = 'qr/' + crypto.createHash('sha1').update(decodeURIComponent(decodeURIComponent(req.params.text))).digest('hex') + '.png'
  qrSvg = qr.image(decodeURIComponent(decodeURIComponent(req.params.text)), { type: 'png' })
  qrSvg.pipe(fs.createWriteStream(filename))
  qrSvg.on('end', function () {
    res.redirect(301, '/' + filename)
    res.end()
  })
  qrSvg.on('error', function () {
    res.send('QR file error')
    res.end()
  })
})

// Get the main page
router.get('/', function (req, res) {
  return res.render(path.join(__dirname + '/../docs/index.html'),
    { GoogleAnalytics: config.GoogleAnalytics,
      SpeedSweepAmount: config.speedSweep_max,
      fee_tx: config.fee_tx,
      speed_sweep_fee: config.speed_sweep_fee,
      confirmation_before_forward: config.confirmation_before_forward});
})

// Get FAQ Page
router.get('/faq', function (req, res) {
  return res.render(path.join(__dirname + '/../docs/faq.html'),
    { GoogleAnalytics: config.GoogleAnalytics,
       RefreshRate: config.marketrate_refresh,
       SpeedSweepAmount: config.speedSweep_max,
       fee_tx: config.fee_tx,
       speed_sweep_fee: config.speed_sweep_fee,
       confirmation_before_forward: config.confirmation_before_forward,
       GatewayLimit: config.max_gateway_client});
})

// Help 1
router.get('/started', function (req, res) {
  return res.sendFile(path.join(__dirname + '/../docs/started.html'));
})

// Contacts me
router.get('/contact', function (req, res) {
  return res.sendFile(path.join(__dirname + '/../docs/contact.html'));
})

// Get the invoice
router.get('/invoice/:text', function (req, res) {
  let invoice_ID = req.params.text
  return res.render(path.join(__dirname + '/../docs/invoice.html'),
    { GoogleAnalytics: config.GoogleAnalytics,
      InvoiceID: invoice_ID});
})

// POST route from contact form
router.post('/contact', function (req, res) {

  let mailOpts, smtpTrans;
  smtpTrans = nodemailer.createTransport(config.smtp);
  mailOpts = {
    from: config.smtp.auth.user,
    to: config.smtp.auth.user,
    subject: 'New message from contact form at pay.btcz.app',
    text: `${req.body.name} (${req.body.email}) says: ${req.body.message}`
  };
  smtpTrans.sendMail(mailOpts, function (error, response) {
    if (error) {
      logger.error('/contact', ['eMail not sent', mailOpts, error.message, error.stack ])
      return res.redirect('/contact?msg=0')
    }
    else {
      logger.log('/contact', ['eMail sent', mailOpts ])
      return res.redirect('/contact?msg=1')
    }
  });

});

// Error return page code
router.use(function (req, res) {
  res.status(404).send('404')
})

module.exports = router

var RIFT_VENDOR_ID = 10291;
var RIFT_PRODUCT_ID = 1;
var DEVICE_INFO = {"vendorId": RIFT_VENDOR_ID, "productId": RIFT_PRODUCT_ID};

var riftDevice;
var knob = document.getElementById('knob');
var requestButton = document.getElementById("requestPermission");

var amount = 0;
var ROTATE_DEGREE = 4;

var transfer = {
  "direction": "in",
  "endpoint": 1,
  "length": 64
};

var onEvent = function(usbEvent) {
    console.log(usbEvent);
    if (usbEvent.resultCode) {
      console.log("Error: " + usbEvent.error);
      return;
    }

    
  };

var gotPermission = function(result) {
    //requestButton.style.display = 'none';
    knob.style.display = 'block';
    console.log('App was granted the "usbDevices" permission.');
    chrome.usb.findDevices( DEVICE_INFO,
      function(devices) {
        if (!devices || !devices.length) {
          console.log('device not found');
          return;
        }
        console.log('Found device: ' + devices[0].handle);
        riftDevice = devices[0];

        initRift();

        chrome.usb.interruptTransfer(riftDevice, transfer, onEvent);
    });
  };

var permissionObj = {permissions: [{'usbDevices': [DEVICE_INFO] }]};

requestButton.addEventListener('click', function() {
  chrome.permissions.request( permissionObj, function(result) {
    if (result) {
      gotPermission();
    } else {
      console.log('App was not granted the "usbDevices" permission.');
      console.log(chrome.runtime.lastError);
    }
  });
});

chrome.permissions.contains(permissionObj, function(result) {
  if (result) {
    gotPermission();
  }
});






function initRift() {
  console.log("initRift()");
  sendKeepAlive(10000);  
}


function sendKeepAlive(keepAliveInterval) {
  console.log("sendKeepAlive()");
  var command = 0;

  var transferInfo = {
    "requestType": "class",
    "recipient": "device",
    "direction": "out",
    "request": 0x09,
    "value": 0x0308,
    "index": 0,
    "data": new Uint8Array([
        8,
        command & 0xFF,
        command >> 8,
        keepAliveInterval & 0xFF,
        keepAliveInterval >> 8
      ]).buffer
  };

  chrome.usb.controlTransfer(riftDevice, transferInfo, sendKeepAliveCompleted);
}

var buf;

function sendKeepAliveCompleted(usbEvent) {
  console.log("sendKeepAliveCompleted()");

  if (chrome.runtime.lastError) {
    console.error("sendCompleted Error:", chrome.runtime.lastError);
  }

  if (usbEvent) {
    if (usbEvent.data) {
      buf = new Uint8Array(usbEvent.data);
      console.log("sendCompleted Buffer:", usbEvent.data.byteLength, buf);

      beginReceiving();
    }
    if (usbEvent.resultCode !== 0) {
      console.error("Error writing to device", usbEvent.resultCode);
    }
  }
}



function beginReceiving() {
  console.log("beginReceiving()");

  var transferInfo = {
    "direction": "in",
    "endpoint" : 1,
    "length": 256
  };

  chrome.usb.bulkTransfer(riftDevice, transferInfo, bulkDataReceived);
}


function bulkDataReceived(usbEvent) {
  console.log("bulkDataReceived()");

  console.log("usbEvent", usbEvent);

  if (chrome.runtime.lastError) {
    console.error("bulkDataReceived Error:", chrome.runtime.lastError);
  }

  if (usbEvent) {
    if (usbEvent.data) {
      buf = new Uint8Array(usbEvent.data);
      console.log("bulkDataReceived Buffer:", usbEvent.data.byteLength, buf);

    }
    if (usbEvent.resultCode !== 0) {
      console.error("Error receiving from device", usbEvent.resultCode);
    }
  }
}
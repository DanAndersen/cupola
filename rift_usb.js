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

        //chrome.usb.interruptTransfer(riftDevice, transfer, onEvent);
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

var mConnected = false;

function sendKeepAliveCompleted(usbEvent) {
  console.log("sendKeepAliveCompleted()");

  if (chrome.runtime.lastError) {
    console.error("sendCompleted Error:", chrome.runtime.lastError);
  }

  if (usbEvent) {
    if (usbEvent.data) {
      buf = new Uint8Array(usbEvent.data);
      console.log("sendCompleted Buffer:", usbEvent.data.byteLength, buf);

      if (!mConnected) {
        console.log("not already connected; connecting");
        mConnected = true;
        beginReceiving();
      }
    }
    if (usbEvent.resultCode !== 0) {
      console.error("Error writing to device", usbEvent.resultCode);
    }
  }
}



var msgCounter = 0;
var frequency = 0;
var numSamples = 0;

function beginReceiving() {
  console.log("beginReceiving()");

  var transferInfo = {
    "direction": "in",
    "endpoint" : 1,
    "length": 64
  };  // 62 is length of a single orientation block

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

      if(parseBuffer(buf)) {
        console.log(bufferString);

        msgCounter += mSampleCount;

        updateOrientationFromMessage();

        console.log("got orientation!");

        numSamples++;

        if (numSamples < 10) {
          beginReceiving();
        } else {
          mConnected = false;
        }
      }

      
    }
    if (usbEvent.resultCode !== 0) {
      console.error("Error receiving from device", usbEvent.resultCode);
    }
  }
}

//-----------------------------------------

var TEMPERATURE_SCALE = 0.01;
var SENSOR_SCALE = 0.0001;

var mSampleCount;
var mTimestamp;
var mLastCommandId;
var mTemperature;
var mMag = new THREE.Vector3();

var samples = [];

var bufferString;

function parseBuffer(buffer) {

  if (buffer.length == 62) {

    mSampleCount = buffer[1];
    mTimestamp = decodeUInt16(buffer, 2);
    mLastCommandId = decodeUInt16(buffer, 4);
    mTemperature = decodeSInt16(buffer, 6) * TEMPERATURE_SCALE;

    var iterationCount = Math.min(3, mSampleCount);
    for (var i = 0; i < iterationCount; i++) {
      acc = unpackSensor(buffer, 8 + 16 * i).multiplyScalar(SENSOR_SCALE);
      gyro = unpackSensor(buffer, 16 + 16 * i).multiplyScalar(SENSOR_SCALE);
      samples[i] = {
        mAcc: acc,
        mGyro: gyro
      };
    }

    mMag.set(
      decodeSInt16(buffer, 56),
      decodeSInt16(buffer, 58),
      decodeSInt16(buffer, 60)
    ).multiplyScalar(SENSOR_SCALE);

    bufferString = "TS: " + mTimestamp + ", Temp: " + mTemperature + "C" +
      "\nAcc:\n" + samples[0].mAcc.x + " m/s^2\n" + samples[0].mAcc.y + " m/s^2\n" + samples[0].mAcc.z + " m/s^2" +
      "\nGyro:\n" + samples[0].mGyro.x + " rad/s\n" + samples[0].mGyro.y + " rad/s\n" + samples[0].mGyro.z + " rad/s" +
      "\nMag:\n" + mMag.x + "\n" + mMag.y + "\n" + mMag.x;

    return true;
  }
  else {
    console.error("incorrect length:", buffer.length);

    bufferString = "PARSE ERROR";

    return false;
  }
}

function decodeUInt16(buffer, start) {
  return (buffer[start+1] << 8 | buffer[start]) & 0xFFFF;
}

function decodeSInt16(buffer, start) {
  return (buffer[start+1] << 8 | buffer[start]);
}

function unpackSensor(buffer, start) {
  return new THREE.Vector3(
    ( buffer[start+0] << 24 | (buffer[start+1] & 0xff) << 16 | (buffer[start+2] & 0xff) << 8 ) >> 11,
    ( buffer[start+2] << 29 | (buffer[start+3] & 0xff) << 21 | (buffer[start+4] & 0xff) << 13 | (buffer[start+5] & 0xff) << 5 ) >> 11,
    ( buffer[start+5] << 26 | (buffer[start+6] & 0xff) << 18 | (buffer[start+7] & 0xff) << 10 ) >> 11 );  
}

//---------------------------------------

function updateOrientationFromMessage() {
  console.log("updateOrientationFromMessage()");
  
}

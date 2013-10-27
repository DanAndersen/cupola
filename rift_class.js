var UsbAdapter = function() {
	if (!chrome.permissions) {
		console.error("UsbAdapter: Requires chrome.permissions API");
		return null;
	}
	if (!chrome.usb) {
		console.error("UsbAdapter: Requires chrome.usb API");
		return null;
	}

	var RIFT_VENDOR_ID = 10291;
	var RIFT_PRODUCT_ID = 1;
	var DEVICE_INFO = {"vendorId": RIFT_VENDOR_ID, "productId": RIFT_PRODUCT_ID};

	var KEEP_ALIVE_INTERVAL = 10000;

	var mPermissionObj = {permissions: [{'usbDevices': [DEVICE_INFO] }]};
	var mHasPermission = false;

	var mRiftConnectionHandle;

	var mKeepAliveIntervalId;

	var mConnected = true;

	var mRunning = false;

	//-----------------------------

	function onWorkerError(e) {
		console.log('WORKER ERROR: line ' + e.lineno + ' in ' + e.filename + ': ' + e.message);
	}

	function onWorkerMessage(e) {
		var data = e.data;

		switch (data.cmd) {
			case 'log':
				console.log('Worker said: [' + data.msg + ']');
				break;
			case 'quat':
				console.log('Received a quat from worker: ' + JSON.stringify(data));

				updateQuatLabel(data);

				if (mRunning) {
					setTimeout(pollRiftSensors, 0);
					//mRunning = false;
				}

				break;
			default:
				console.error('Unknown command: ' + data.msg);
		}
	}

	//-----------------------------

	// http://www.usb.org/developers/devclass_docs/HID1_11.pdf from page 51
  // 0x21   => Send direction
  // 0x09   => Set_Report request
  // 0x0308 => Report Type Feature 0x03 << 8 | Report ID 0x08 (keep alive)
  var mKeepAliveCommand = 0;
	var mKeepAliveTransferInfo = {
    "requestType": "class",
    "recipient": "device",
    "direction": "out",
    "request": 0x09,
    "value": 0x0308,
    "index": 0,
    "data": new Uint8Array([
        8,
        mKeepAliveCommand & 0xFF,
        mKeepAliveCommand >> 8,
        KEEP_ALIVE_INTERVAL & 0xFF,
        KEEP_ALIVE_INTERVAL >> 8
      ]).buffer
  };



	//-----------------------------

	var sendKeepAliveCompleted = function(usbEvent) {
		if (chrome.runtime.lastError) {
	    console.error("sendKeepAliveCompleted Error:", chrome.runtime.lastError);
	  }

	  if (usbEvent) {
	    if (usbEvent.data) {
	      buf = new Uint8Array(usbEvent.data);
	      console.log("sendKeepAliveCompleted Buffer:", usbEvent.data.byteLength, buf);

	      if (!mConnected) {
	        console.log("not already connected; connecting");
	        mConnected = true;
	      }
	    }
	    if (usbEvent.resultCode !== 0) {
	      console.error("Error writing to device", usbEvent.resultCode);
	    }
	  }
	};

	var sendKeepAlive = function() {
		console.log("sendKeepAlive()");
		chrome.usb.controlTransfer(mRiftConnectionHandle, mKeepAliveTransferInfo, sendKeepAliveCompleted);
	};

	//-----------------

	var mPollSensorsTransferInfo = {
    "direction": "in",
    "endpoint" : 1,
    "length": 64
  };  // 62 is length of a single orientation block

	var pollRiftSensors = function() {
		//console.log("pollRiftSensors()");
		chrome.usb.bulkTransfer(mRiftConnectionHandle, mPollSensorsTransferInfo, sensorDataReceived);
	};


	var sensorDataReceived = function(usbEvent) {
		//console.log("sensorDataReceived()");
	  //console.log("usbEvent", usbEvent);

	  if (chrome.runtime.lastError) {
	    console.error("sensorDataReceived Error:", chrome.runtime.lastError);
	  }

	  if (usbEvent) {
	    if (usbEvent.data) {
	      //console.log("sensorDataReceived Buffer:", usbEvent.data.byteLength);   

	      process(usbEvent.data);
	    }
	    if (usbEvent.resultCode !== 0) {
	      console.error("Error receiving from device", usbEvent.resultCode);
	    }
	  }
	};


	//-------------------

	var initRift = function() {
	  console.log("initRift()");

	  if (!mRunning) {
	  	mRunning = true;

	  	// send first keep-alive to start up the connection
	  	sendKeepAlive();

	  	// start up interval task to send keep-alive message
	  	mKeepAliveIntervalId = setInterval(sendKeepAlive, KEEP_ALIVE_INTERVAL);

	  	// start receiving data from rift
	  	pollRiftSensors();
	  }
	};

	var gotPermission = function() {
		console.log("App was granted the 'usbDevices' permission.");
		mHasPermission = true;

		chrome.usb.findDevices( DEVICE_INFO,
      function(devices) {
        if (!devices || !devices.length) {
          console.log('device not found');
          return;
        }
        console.log('Found device: ' + devices[0].handle);
        mRiftConnectionHandle = devices[0];

        initRift();
    });
	};

	var connect = function() {
		console.log("connect()");
		
		chrome.permissions.contains( mPermissionObj, function(result) {
		  if (result) {
		    gotPermission();
		  }
		});
	};

	var disconnect = function() {
		console.log("disconnect()");

		if (mKeepAliveIntervalId) {
			console.log("stopping keep-alive action");
			clearInterval(mKeepAliveIntervalId);	
		}
		
		mRunning = false;
		
	};

	var getPermissionObject = function() {
		return mPermissionObj;
	};

	return {
		"connect": connect,
		"disconnect": disconnect,
		"getPermissionObject": getPermissionObject,
		"pollRiftSensors": pollRiftSensors
	};

};



//////////////////////////////////////

var usb = new UsbAdapter();
var requestButton = document.getElementById("requestPermission");

requestButton.addEventListener('click', function() {
  chrome.permissions.request( usb.getPermissionObject(), function(result) {
    if (result) {
    	console.log("got permission");
      usb.connect();
    } else {
      console.log('App was not granted the "usbDevices" permission.');
      console.log(chrome.runtime.lastError);
    }
  });
});



var connectButton = document.getElementById("connect");
connectButton.addEventListener('click', function() {
	usb.connect();
});

var disconnectButton = document.getElementById("disconnect");
disconnectButton.addEventListener('click', function() {
	usb.disconnect();
});



var statDiv = document.getElementById("stats");

function updateQuatLabel(quat) {
	statDiv.innerText = JSON.stringify(quat);
}

//====================================================================
// putting worker computation back into normal thread













var TrackerMessage = function() {

	var SENSOR_SCALE = 0.0001;
	var TEMPERATURE_SCALE = 0.01;

	var mSampleCount;
	var mTimestamp;
	var mLastCommandId;

	var samples = [];	// Vector3 for mAcc, mGyro
	var mMag = new THREE.Vector3();	// Vector3

	var parseBuffer = function(buffer) {
		log("parseBuffer()");

		if (buffer.length == 62) {
			log("correct length: " + buffer.length);

			mSampleCount = buffer[1];
			mTimestamp = decodeUInt16(buffer, 2);
			mLastCommandId = decodeUInt16(buffer, 4);
			mTemperature = decodeSInt16(buffer, 6) * TEMPERATURE_SCALE;

			var iterationCount = Math.min(3, mSampleCount);
			for (var i = 0; i < iterationCount; i++) {
				samples[i] = {
					mAcc: unpackSensor(buffer, 8 + 16 * i).multiplyScalar(SENSOR_SCALE),
					mGyro: unpackSensor(buffer, 16 + 16 * i).multiplyScalar(SENSOR_SCALE)
				};
			}

			mMag.set(
				decodeSInt16(buffer, 56),
				decodeSInt16(buffer, 58),
				decodeSInt16(buffer, 60)
			).multiplyScalar(SENSOR_SCALE);

			return true;
		} else {
			log("wrong length: " + buffer.length);
			return false;
		}
	};

	var decodeUInt16 = function(buffer, start) {
		return (buffer[start+1] << 8 | buffer[start]) & 0xffff;
	};

	var decodeSInt16 = function(buffer, start) {
		return (buffer[start+1] << 8 | buffer[start]);
	};

	var unpackSensor = function(buffer, start) {
		return new THREE.Vector3(
			( buffer[start+0] << 24 | (buffer[start+1] & 0xff) << 16 | (buffer[start+2] & 0xff) << 8 ) >> 11,
      ( buffer[start+2] << 29 | (buffer[start+3] & 0xff) << 21 | (buffer[start+4] & 0xff) << 13 | (buffer[start+5] & 0xff) << 5 ) >> 11,
      ( buffer[start+5] << 26 | (buffer[start+6] & 0xff) << 18 | (buffer[start+7] & 0xff) << 10 ) >> 11
		);
	};

	var toString = function() {
		return "TS: " + mTimestamp + ", Temp: " + mTemperature + "C\n" +
			"Acc:\n" +
			"\t" + samples[0].mAcc.x + " m/s^2\n" + 
			"\t" + samples[0].mAcc.y + " m/s^2\n" +
			"\t" + samples[0].mAcc.z + " m/s^2\n" + 
			"Gyro:\n" +
			"\t" + samples[0].mGyro.x + " rad/s\n" + 
			"\t" + samples[0].mGyro.y + " rad/s\n" +
			"\t" + samples[0].mGyro.z + " rad/s\n" + 
			"Mag:\n" +
			"\t" + mMag.x + "\n" + 
			"\t" + mMag.y + "\n" +
			"\t" + mMag.z;
	};


	var getSampleCount = function() {
		return mSampleCount;
	};

	var getSamples = function() {
		return samples;
	};

	var getMag = function() {
		return mMag;
	};

	var getTemperature = function() {
		return mTemperature;
	};

	return {
		'parseBuffer': parseBuffer,
		'toString': toString,
		'getSampleCount': getSampleCount,
		'getSamples': getSamples,
		'getMag': getMag,
		'getTemperature': getTemperature
	};

};

//---------------------------------

var MessageBodyFrame = function() {
	var mAcceleration = new THREE.Vector3();
	var mRotationRate = new THREE.Vector3();
	var mMagneticField = new THREE.Vector3();
	var mTemperature;
	var mTimeDelta;

	var getTimeDelta = function() {
		return mTimeDelta;
	};

	var setTimeDelta = function(td) {
		mTimeDelta = td;
	};

	var getTemperature = function() {
		return mTemperature;
	};

	var setTemperature = function(t) {
		mTemperature = t;
	};

	var getAcceleration = function() {
		return mAcceleration;
	};

	var setAcceleration = function(a) {
		mAcceleration.copy(a);
	};

	var getRotationRate = function() {
		return mRotationRate;
	}

	var setRotationRate = function(rr) {
		mRotationRate.copy(rr);
	};

	var getMagneticField = function() {
		return mMagneticField;
	};

	var setMagneticField = function(mf) {
		mMagneticField.copy(mf);
	};

	return {
		'getAcceleration': getAcceleration,
		'setAcceleration': setAcceleration,
		'getRotationRate': getRotationRate,
		'setRotationRate': setRotationRate,
		'getMagneticField': getMagneticField,
		'setMagneticField': setMagneticField,
		'getTemperature': getTemperature,
		'setTemperature': setTemperature,
		'getTimeDelta': getTimeDelta,
		'setTimeDelta': setTimeDelta
	};
};


var RiftOrientation = function() {

	var timeUnit = 1.0 / 1000.0;
	var YAW_MULT = 1.0;
	var GAIN = 0.5;
	var ENABLE_GRAVITY = true;

	var mAngV = new THREE.Vector3();
	var mA = new THREE.Vector3();
	var mOrientation = new THREE.Quaternion();
	var mSensors = new MessageBodyFrame();

	var updateOrientationFromTrackerMessage = function(msg) {
		log("updateOrientationFromTrackerMessage()");
		var iterations = msg.getSampleCount();
		log("iterations: " + iterations);
		if (msg.getSampleCount() > 3) {
			iterations = 3;
			mSensors.setTimeDelta((msg.getSampleCount() - 2) * timeUnit);
		} else {
			mSensors.setTimeDelta(timeUnit);
		}
		log("sensor timedelta: " + mSensors.getTimeDelta());

		for (var i = 0; i < iterations; i++) {
			log("iteration #" + i);
			mSensors.setAcceleration(msg.getSamples()[i].mAcc);
			mSensors.setRotationRate(msg.getSamples()[i].mGyro);
			mSensors.setMagneticField(msg.getMag());
			mSensors.setTemperature(msg.getTemperature());
			log("\tacceleration: " + JSON.stringify(mSensors.getAcceleration()));
			log("\tRotationRate: " + JSON.stringify(mSensors.getRotationRate()));
			log("\tMagneticField: " + JSON.stringify(mSensors.getMagneticField()));
			log("\tTemperature: " + mSensors.getTemperature());

			updateOrientationFromMessageBodyFrame(mSensors);

			mSensors.setTimeDelta(timeUnit);
		}

	};

	var dQ = new THREE.Quaternion();
	var feedback = new THREE.Quaternion();
	var feedback2 = new THREE.Quaternion();
	var q1 = new THREE.Quaternion();
	var q2 = new THREE.Quaternion();
	var dV = new THREE.Vector3();
	var aw = new THREE.Vector3();
	var tempV = new THREE.Vector3();
	var yUp = new THREE.Vector3();

	var updateOrientationFromMessageBodyFrame = function(sensors) {
		log("updateOrientationFromMessageBodyFrame()");

		mAngV.copy(sensors.getRotationRate());
		log("mAngV before: " + JSON.stringify(mAngV));
		mAngV.y *= YAW_MULT;
		log("mAngV after: " + JSON.stringify(mAngV));

		mA.copy(sensors.getAcceleration()).multiplyScalar(sensors.getTimeDelta());

		dV.copy(mAngV).multiplyScalar(sensors.getTimeDelta());
		log("dV: " + JSON.stringify(dV));

		var angle = dV.length();
		log("angle: " + angle);

		if (angle > 0.0) {
			var halfa = angle * 0.5;
			var sina = Math.sin(halfa) / angle;
			dQ.set(
				dV.x * sina,
				dV.y * sina,
				dV.z * sina,
				Math.cos(halfa)
			);
			mOrientation.multiply(dQ);
		}

		var accelMagnitude = sensors.getAcceleration().length();
		var angVMagnitude = mAngV.length();
		var gravityEpsilon = 0.4;
		var angVEpsilon = 3.0;

		log("accelMagnitude: " + accelMagnitude);

		if (ENABLE_GRAVITY && 
			(Math.abs(accelMagnitude - 9.81) < gravityEpsilon) &&
			(angVMagnitude < angVEpsilon)) {

			yUp.set(0,1,0);
			aw = rotate(aw, mOrientation, mA);

			feedback.set(
				-aw.z * GAIN,
				0,
				aw.x * GAIN,
				1);

			q1.copy(feedback).multiply(mOrientation);
			q1.normalize();

			var angle0 = angleBetween(yUp, aw);
			log("angle0: " + angle0);

			tempV = rotate(tempV, q2, mA);
			var angle1 = angleBetween(yUp, tempV);
			log("angle1: " + angle1);

			if(angle1 < angle0) {
				mOrientation.copy(q1);
			} else {

				feedback2.set(
					aw.z * GAIN,
					0,
					-aw.x * GAIN,
					1);

				q2.copy(feedback2).multiply(mOrientation);
				q2.normalize();

				tempV = rotate(tempV, q2, mA);
				var angle2 = angleBetween(yUp, tempV);
				log("angle2: " + angle2);
				if (angle2 < angle0) {
					mOrientation.copy(q2);
				}

			}
		}
		log("finished updating orientation");
		log("mOrientation: " + JSON.stringify(mOrientation));
	};

	var tempQ = new THREE.Quaternion();
	var invQ = new THREE.Quaternion();

	var rotate = function(result, q, v) {
		log("rotate()");
		tempQ.copy(q);
		invQ.copy(q).inverse();

		tempQ.multiply(v.x, v.y, v.z, 1);
		//tempQ.multiplyVector3(v, tempQ);
		tempQ.multiply(invQ);

		result.copy(tempQ.x, tempQ.y, tempQ.z);
		return result;
	};

	var angleBetween = function(v1, v2) {
		return Math.acos( v1.dot(v2) / ((v1.length())*(v2.length())) );
	};

	var getOrientation = function() {
		return mOrientation;
	};

	return {
		"updateOrientation": updateOrientationFromTrackerMessage,
		"getOrientation": getOrientation
	};
};

var mTrackerMessage = new TrackerMessage();
var mRiftOrientation = new RiftOrientation();

function process(buf) {
	log("process()");
	var buffer = new Uint8Array(buf);
	if (mTrackerMessage.parseBuffer(buffer)) {
		log("message successfully parsed");

		log(mTrackerMessage.toString());

		log("updating orientation");
		mRiftOrientation.updateOrientation(mTrackerMessage);

		//complete(mRiftOrientation.getOrientation());
		updateQuatLabel(mRiftOrientation.getOrientation());

		bridgeOrientationUpdated(mRiftOrientation.getOrientation());

		usb.pollRiftSensors();
	} else {
		log("message failed parsing");
	}
}








function log(logMessage) {
	//console.log(logMessage);
}


//====================================================================



var RiftUsb = function(config) {
	config = config ? config : {};

	var mRetryOnDisconnect = true;

	var mDebugEnabled = config.hasOwnProperty("debug") ? config["debug"] : true;

	var callbacks = {
		onOrientationUpdate: null,
		onConfigUpdate: null,
		onConnect: null,
		onDisconnect: null
	};

	// hook up callbacks specified in config
	for (var cb in callbacks) {
		if (typeof(config[cb]) == "function") {
			callbacks[cb] = config[cb];
		}
	}

	var error = function(message) {
		console.error("RiftUsb: " + message);
	}

	var debug = function(message) {
		if (mDebugEnabled) {
			console.log("RiftUsb: " + message);
		}
	}


	//---------------------

	var isConnected = function() {
		debug("isConnected()");
		error("isConnected() not implemented yet");
	}

	var disconnect = function() {
		debug("disconnect()");
		error("disconnect() not implemented yet");
	}

	var connect = function() {
		debug("connect()");
		error("connect() not implemented yet");

		mRetryOnDisconnect = true;

	}

	var getOrientation = function() {
		debug("getOrientation()");
		error("getOrientation() not implemented yet");
	}

	var getConfiguration = function() {
		debug("getConfiguration()");
		error("getConfiguration() not implemented yet");
	}

	return {
		"isConnected": isConnected,
		"disconnect": disconnect,
		"connect": connect,
		"getOrientation": getOrientation,
		"getConfiguration": getConfiguration
	}
};

//------------------------

var myRiftUsb = new RiftUsb({
	"onOrientationUpdate": onOrientationUpdate,
	"onConfigUpdate": onConfigUpdate,
	"onConnect": onConnect,
	"onDisconnect": onDisconnect
});

var onOrientationUpdate = function(quat) {
	console.log("onOrientationUpdate", quat);
}

var onConfigUpdate = function(config) {
	console.log("onConfigUpdate", config);
}

var onConnect = function() {
	console.log("onConnect");
}

var onDisconnect = function() {
	console.log("onDisconnect");
}

//========================================================

















var renderer, camera;
var scene, element;
var ambient, point;
var aspectRatio, windowHalf;
var mouse, time;

var controls;
var clock;

var useRift = false;

var riftCam;

var boxes = [];
var core = [];
var dataPackets = [];

var ground, groundGeometry, groundMaterial;

var bodyAngle;
var bodyAxis;
var bodyPosition;
var viewAngle;

var velocity;
//var oculusBridge;



// Map for key states
var keys = [];
for(var i = 0; i < 130; i++){
  keys.push(false);
}


function initScene() {
  clock = new THREE.Clock();
  mouse = new THREE.Vector2(0, 0);

  windowHalf = new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2);
  aspectRatio = window.innerWidth / window.innerHeight;
  
  scene = new THREE.Scene();  

  camera = new THREE.PerspectiveCamera(45, aspectRatio, 1, 10000);
  camera.useQuaternion = true;

  camera.position.set(100, 150, 100);
  camera.lookAt(scene.position);

  // Initialize the renderer
  renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setClearColor(0xdbf7ff);
  renderer.setSize(window.innerWidth, window.innerHeight);

   scene.fog = new THREE.Fog(0xdbf7ff, 300, 700);

  element = document.getElementById('viewport');
  element.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera);
}


function initLights(){

  ambient = new THREE.AmbientLight(0x222222);
  scene.add(ambient);

  point = new THREE.DirectionalLight( 0xffffff, 1, 0, Math.PI, 1 );
  point.position.set( -250, 250, 150 );
  
  scene.add(point);
}

var floorTexture;
function initGeometry(){

  floorTexture = new THREE.ImageUtils.loadTexture( "textures/tile.jpg" );
  floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping; 
  floorTexture.repeat.set( 50, 50 );
  floorTexture.anisotropy = 32;

  var floorMaterial = new THREE.MeshBasicMaterial( { map: floorTexture, transparent:true, opacity:0.80 } );
  var floorGeometry = new THREE.PlaneGeometry(1000, 1000, 10, 10);
  var floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;

  scene.add(floor);

  // add some boxes.
  var boxTexture = new THREE.ImageUtils.loadTexture( "textures/blue_blue.jpg" );
  for(var i = 0; i < 200; i++){
    var material = new THREE.MeshLambertMaterial({ emissive:0x505050, map: boxTexture, color: 0xffffff});
    
    var height = Math.random() * 150+10;
    var width = Math.random() * 20 + 2;
    
    var box = new THREE.Mesh( new THREE.CubeGeometry(width, height, width), material);

    box.position.set(Math.random() * 1000 - 500, height/2 ,Math.random() * 1000 - 500);
    box.rotation.set(0, Math.random() * Math.PI * 2, 0);
    
    boxes.push(box);
    scene.add(box);
  }

  var coreTexture = new THREE.ImageUtils.loadTexture( "textures/purple_blue.jpg" );
  for(var i = 0; i < 50; i++){
    var material = new THREE.MeshLambertMaterial({ emissive:0x505050, map: coreTexture, color: 0xffffff});
    
    var height = Math.random() * 100+30;
    
    var box = new THREE.Mesh( new THREE.CubeGeometry(height, height, height), material);

    box.position.set(Math.random() * 1000 - 500, Math.random() * 150 - 300 ,Math.random() * 1000 - 500);
    box.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
    
    core.push(box);
    scene.add(box);
  }

  for(var i = 0; i < 100; i++){
    var material = new THREE.MeshLambertMaterial({ emissive:0x008000, color: 0x00FF00});
    
    var size = Math.random() * 15+3;
    
    var box = new THREE.Mesh( new THREE.CubeGeometry(size, size*0.1, size*0.1), material);

    box.position.set(Math.random() * 1000 - 500, Math.random() * 100 + 100 ,Math.random() * 1000 - 500);
    //box.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
    
    var speedVector;
    if(Math.random() > 0.5){
      speedVector = new THREE.Vector3(0, 0, Math.random() * 1.5 + 0.5);
      box.rotation.y = Math.PI / 2;
    } else {
      speedVector = new THREE.Vector3(Math.random() * 1.5 + 0.5, 0, 0);
    }

    dataPackets.push({
      obj: box,
      speed: speedVector
    });
    scene.add(box);
  }
}


function init(){

  document.addEventListener('keydown', onKeyDown, false);
  document.addEventListener('keyup', onKeyUp, false);
  document.addEventListener('mousedown', onMouseDown, false);
  document.addEventListener('mousemove', onMouseMove, false);

  document.getElementById("toggle-render").addEventListener("click", function(){
    useRift = !useRift;
    onResize();
  });

  document.getElementById("help").addEventListener("click", function(){
    var el = document.getElementById("help-text");
    el.style.display = (el.style.display == "none") ? "" : "none";
  });

  window.addEventListener('resize', onResize, false);

  time          = Date.now();
  bodyAngle     = 0;
  bodyAxis      = new THREE.Vector3(0, 1, 0);
  bodyPosition  = new THREE.Vector3(0, 15, 0);
  velocity      = new THREE.Vector3();

  initScene();
  initGeometry();
  initLights();
  
  /*
  oculusBridge = new OculusBridge({
    "debug" : true,
    "onOrientationUpdate" : bridgeOrientationUpdated,
    "onConfigUpdate"      : bridgeConfigUpdated,
    "onConnect"           : bridgeConnected,
    "onDisconnect"        : bridgeDisconnected
  });
  oculusBridge.connect();
  */

  riftCam = new THREE.OculusRiftEffect(renderer);
}


function onResize() {
  if(!useRift){
    windowHalf = new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2);
    aspectRatio = window.innerWidth / window.innerHeight;
   
    camera.aspect = aspectRatio;
    camera.updateProjectionMatrix();
   
    renderer.setSize(window.innerWidth, window.innerHeight);
  } else {
    riftCam.setSize(window.innerWidth, window.innerHeight);
  }
}


function bridgeConnected(){
  document.getElementById("logo").className = "";
}

function bridgeDisconnected(){
  document.getElementById("logo").className = "offline";
}

function bridgeConfigUpdated(config){
  console.log("Oculus config updated.");
  riftCam.setHMD(config);      
}

function bridgeOrientationUpdated(quatValues) {

  // Do first-person style controls (like the Tuscany demo) using the rift and keyboard.

  // TODO: Don't instantiate new objects in here, these should be re-used to avoid garbage collection.

  // make a quaternion for the the body angle rotated about the Y axis.
  var quat = new THREE.Quaternion();
  quat.setFromAxisAngle(bodyAxis, bodyAngle);

  // make a quaternion for the current orientation of the Rift
  var quatCam = new THREE.Quaternion(quatValues.x, quatValues.y, quatValues.z, quatValues.w);

  // multiply the body rotation by the Rift rotation.
  quat.multiply(quatCam);


  // Make a vector pointing along the Z axis and rotate it accoring to the combined look/body angle.
  var xzVector = new THREE.Vector3(0, 0, 1);
  xzVector.applyQuaternion(quat);

  // Compute the X/Z angle based on the combined look/body angle.  This will be used for FPS style movement controls
  // so you can steer with a combination of the keyboard and by moving your head.
  viewAngle = Math.atan2(xzVector.z, xzVector.x) + Math.PI;

  // Apply the combined look/body angle to the camera.
  camera.quaternion.copy(quat);
}


function onMouseMove(event) {
  mouse.set( (event.clientX / window.innerWidth - 0.5) * 2, (event.clientY / window.innerHeight - 0.5) * 2);
}


function onMouseDown(event) {
  // Stub
  floorTexture.needsUpdate = true;
  console.log("update.");
}


function onKeyDown(event) {

  if(event.keyCode == 48){ // zero key.
    useRift = !useRift;
    onResize();
  }

  // prevent repeat keystrokes.
  if(!keys[32] && (event.keyCode == 32)){ // Spacebar to jump
    velocity.y += 1.9;
  }

  keys[event.keyCode] = true;
}


function onKeyUp(event) {
  keys[event.keyCode] = false;
}


function updateInput(delta) {
  
  var step        = 25 * delta;
  var turn_speed  = (55 * delta) * Math.PI / 180;


  // Forward/backward

  if(keys[87] || keys[38]){ // W or UP
      bodyPosition.x += Math.cos(viewAngle) * step;
      bodyPosition.z += Math.sin(viewAngle) * step;
  }

  if(keys[83] || keys[40]){ // S or DOWN
      bodyPosition.x -= Math.cos(viewAngle) * step;
      bodyPosition.z -= Math.sin(viewAngle) * step;
  }

  // Turn

  if(keys[81]){ // E
      bodyAngle += turn_speed;
  }   
  
  if(keys[69]){ // Q
       bodyAngle -= turn_speed;
  }

  // Straif

  if(keys[65] || keys[37]){ // A or LEFT
      bodyPosition.x -= Math.cos(viewAngle + Math.PI/2) * step;
      bodyPosition.z -= Math.sin(viewAngle + Math.PI/2) * step;
  }   
  
  if(keys[68] || keys[39]){ // D or RIGHT
      bodyPosition.x += Math.cos(viewAngle+Math.PI/2) * step;
      bodyPosition.z += Math.sin(viewAngle+Math.PI/2) * step;
  }
  

  // VERY simple gravity/ground plane physics for jumping.
  
  velocity.y -= 0.15;
  
  bodyPosition.y += velocity.y;
  
  if(bodyPosition.y < 15){
    velocity.y *= -0.12;
    bodyPosition.y = 15;
  }

  // update the camera position when rendering to the oculus rift.
  if(useRift) {
    camera.position.set(bodyPosition.x, bodyPosition.y, bodyPosition.z);
  }
}


function animate() {
  var delta = clock.getDelta();
  time += delta;
  
  updateInput(delta);
  for(var i = 0; i < core.length; i++){
    core[i].rotation.x += delta * 0.25;
    core[i].rotation.y -= delta * 0.33;
    core[i].rotation.z += delta * 0.1278;
  }

  var bounds = 600;
  for(var i = 0; i < dataPackets.length; i++){
    dataPackets[i].obj.position.add( dataPackets[i].speed);
    if(dataPackets[i].obj.position.x < -bounds) {
      dataPackets[i].obj.position.x = bounds;
    } else if(dataPackets[i].obj.position.x > bounds){
      dataPackets[i].obj.position.x = -bounds;
    }
    if(dataPackets[i].obj.position.z < -bounds) {
      dataPackets[i].obj.position.z = bounds;
    } else if(dataPackets[i].obj.position.z > bounds){
      dataPackets[i].obj.position.z = -bounds;
    }
  }

  requestAnimationFrame(animate);
  render();
}


function render() { 
  if(useRift){
    riftCam.render(scene, camera);
  }else{
    controls.update();
    renderer.render(scene, camera);
  }
}


window.onload = function() {
  init();
  animate();
}
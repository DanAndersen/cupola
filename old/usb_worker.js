// Web Worker

importScripts('lib/vector3-modified.js');
importScripts('lib/quaternion-modified.js');
importScripts('lib/euler-modified.js');


self.addEventListener('message', function(e) {
	var data = e.data;
	switch (data.cmd) {
		case 'start':
			log('WORKER STARTED: ' + data.msg);

			break;
		case 'stop':
			log('WORKER STOPPED: ' + data.msg);

			self.close();	// Terminates worker
			break;
		case 'process':
			log('WORKER PROCESSING');

			process(data.msg);
			//mockProcess(data.msg);

			break;
		default:
			self.postMessage('Unknown command: ' + data.msg);

	}
}, false);

//----------------------------------------


var mCount = 0;

function mockProcess(buffer) {
	var quat = new Quaternion(mCount, mCount, mCount, mCount);
	mCount++;
	complete(quat);
}







var TrackerMessage = function() {

	var SENSOR_SCALE = 0.0001;
	var TEMPERATURE_SCALE = 0.01;

	var mSampleCount;
	var mTimestamp;
	var mLastCommandId;

	var samples = [];	// Vector3 for mAcc, mGyro
	var mMag = new Vector3();	// Vector3

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
		return new Vector3(
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
	var mAcceleration = new Vector3();
	var mRotationRate = new Vector3();
	var mMagneticField = new Vector3();
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

	var mAngV = new Vector3();
	var mA = new Vector3();
	var mOrientation = new Quaternion();
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

	var dQ = new Quaternion();
	var feedback = new Quaternion();
	var feedback2 = new Quaternion();
	var q1 = new Quaternion();
	var q2 = new Quaternion();
	var dV = new Vector3();
	var aw = new Vector3();
	var tempV = new Vector3();
	var yUp = new Vector3();

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

	var tempQ = new Quaternion();
	var invQ = new Quaternion();

	var rotate = function(result, q, v) {
		log("rotate()");
		tempQ.copy(q);
		invQ.copy(q).inverse();

		tempQ.multiply(v.x, v.y, v.z, 1);
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

		complete(mRiftOrientation.getOrientation());

	} else {
		log("message failed parsing");
	}
}



//----------------------------------------

function complete(quat) {
	self.postMessage({'cmd':'quat', 'msg': quat});
}

function log(logMessage) {
	//self.postMessage({'cmd':'log', 'msg': logMessage});
}


//----------------------------------------



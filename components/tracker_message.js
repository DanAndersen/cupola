var TrackerMessage = function() {

	var mLoggingEnabled = false;

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

	var log = function(message) {
		if (mLoggingEnabled) {
			console.log(message);
		}
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
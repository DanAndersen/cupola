var SensorFusion = function() {

	var mLoggingEnabled = false;

	var mEnablePrediction = true;
	var mEnableGravity = true;
	var mEnableYawCorrection = false;
	var mMotionTrackingEnabled = true;
	
	//===========================================================================
	// Calibration

	// when loaded from calibration, this will be different
	var mMagCalibrationMatrix = new THREE.Matrix4().identity();
	var mMagCalibrationTime;
	var mMagCalibrated = false;

	var MAX_DEVICE_PROFILE_MAJOR_VERSION = 1;

	//===========================================================================

	var mGain = 0.05;

	var mPredictionDT = 0.03;	// default lookahead time in seconds

	var MATHF_TOLERANCE = 0.00001;

	var mFRawMag = new SensorFilterVector3(10);
	var mFAngV = new SensorFilterVector3(10);

	var mTiltAngleFilter = new SensorFilterScalar(1000);

	var mDeltaT = 0;
	var mAngV = new THREE.Vector3();
	var mA = new THREE.Vector3();
	var mRawMag = new THREE.Vector3();
	var mCalMag = new THREE.Vector3();

	var mGyroOffset = new THREE.Vector3();

	var mStage = 0;
	var mRunningTime = 0;

	var mMagRefIdx = -1;
	var MAG_MAX_REFERENCES = 1000;
	// initialize mag refs arrays
	var mMagRefsInBodyFrame = [];
	var mMagRefsInWorldFrame = [];
	for (var i = 0; i < MAG_MAX_REFERENCES; i++) {
		mMagRefsInBodyFrame[i] = new THREE.Vector3();
		mMagRefsInWorldFrame[i] = new THREE.Vector3();
	}
	var mMagRefScore = 0;
	var mMagNumReferences = 0;

	var mQ = new THREE.Quaternion();

	var mSensors = new MessageBodyFrame();

	var TIME_UNIT = 1.0 / 1000.0;

	var updateOrientationFromTrackerMessage = function(trackerMessage) {
		log("updateOrientationFromTrackerMessage()");
		var iterations = trackerMessage.getSampleCount();
		log("iterations: " + iterations);
		if (trackerMessage.getSampleCount() > 3) {
			iterations = 3;
			mSensors.setTimeDelta((trackerMessage.getSampleCount() - 2) * TIME_UNIT);
		} else {
			mSensors.setTimeDelta(TIME_UNIT);
		}
		log("sensor timedelta: " + mSensors.timeDelta);

		for (var i = 0; i < iterations; i++) {
			mSensors.setAcceleration(trackerMessage.getSamples()[i].mAcc);
			mSensors.setRotationRate(trackerMessage.getSamples()[i].mGyro);
			mSensors.setMagneticField(trackerMessage.getMag());
			mSensors.setTemperature(trackerMessage.getTemperature());

			if (mLoggingEnabled) {
				log("iteration #" + i);
				log("\tacceleration: " + JSON.stringify(mSensors.acceleration));
				log("\tRotationRate: " + JSON.stringify(mSensors.rotationRate));
				log("\tMagneticField: " + JSON.stringify(mSensors.magneticField));
				log("\tTemperature: " + mSensors.temperature);
			}

			handleMessage(mSensors);

			mSensors.setTimeDelta(TIME_UNIT);
		}

	};

	var log = function(message) {
		if (mLoggingEnabled) {
			console.log(message);
		}
	};

	var isMotionTrackingEnabled = function() {
		return mMotionTrackingEnabled;
	}


	var UP_CONST = new THREE.Vector3(0,1,0);
	var qInv = new THREE.Quaternion();
	var up = new THREE.Vector3();

	var handleMessage = function(msg) {
		log("handleMessage()");
		if (!(msg instanceof MessageBodyFrame) || !isMotionTrackingEnabled()) {
			log("returning early");
			return;
		}

		// Put the sensor readings into convenient local variables
		var gyro = msg.rotationRate;
		var accel = msg.acceleration;
		var mag = msg.magneticField;

		log("gyro", gyro);
		log("accel", accel);
		log("mag", mag);

		// Insert current sensor data into filter history
		mFRawMag.addElement(mag);
		mFAngV.addElement(gyro);

		// Apply the calibration parameters to raw mag
		var calMag = mMagCalibrated ? getCalibratedMagValue(mFRawMag.mean()) : mFRawMag.mean();

		// Set variables accessible through the class API
		mDeltaT = msg.timeDelta;
		mAngV.copy(gyro);
		mA.copy(accel);
		mRawMag.copy(mag);
		mCalMag.copy(calMag);

		// Keep track of time
		mStage++;
		mRunningTime += mDeltaT;

		// Small preprocessing
		qInv.copy(mQ).inverse();
		up.copy(UP_CONST).applyQuaternion(qInv);

		var gyroCorrected = gyro.clone();

		// Apply integral term
    // All the corrections are stored in the Simultaneous Orthogonal Rotations Angle representation,
    // which allows to combine and scale them by just addition and multiplication
    if (mEnableGravity || mEnableYawCorrection) {
    	gyroCorrected.sub(mGyroOffset);
    }

    if (mEnableGravity) {
    	var spikeThreshold 		= 0.01;
    	var gravityThreshold 	= 0.1;
    	var proportionalGain	= 5 * mGain;	// Gain parameter should be removed in a future release
    	var integralGain 			= 0.0125;

    	var tiltCorrection = computeCorrection(accel, up);	// (vec3, vec3) --> vec3

    	if (mStage > 5) {
    		// Spike detection
    		var tiltAngle = up.angleTo(accel);
    		mTiltAngleFilter.addElement(tiltAngle);
    		if (tiltAngle > mTiltAngleFilter.mean() + spikeThreshold) {
    			proportionalGain = integralGail = 0;
    		}
    		// Acceleration detection
    		var gravity = 9.8;
    		if (Math.abs(accel.length() / gravity - 1) > gravityThreshold) {
    			integralGain = 0;
    		}

    	} else {
    		// Apply full correction at the startup
    		proportionalGain = 1 / mDeltaT;
    		integralGain = 0;
    	}

    	gyroCorrected.add(tiltCorrection.clone().multiplyScalar(proportionalGain));
    	mGyroOffset.sub(tiltCorrection.clone().multiplyScalar(integralGain).multiplyScalar(mDeltaT));
    }

    if (mEnableYawCorrection && mMagCalibrated && mRunningTime > 2.0) {
    	var maxMagRefDist = 0.1;
    	var maxTiltError = 0.05;
    	var proportionalGain = 0.01;
    	var integralGain = 0.0005;

    	if (mMagRefIdx < 0 || calMag.distanceTo(mMagRefsInBodyFrame[mMagRefIdx]) > maxMagRefDist) {
    		
    		// Delete a bad point
    		if (mMagRefIdx >= 0 && mMagRefScore < 0) {
    			mMagNumReferences--;
    			mMagRefsInBodyFrame[mMagRefIdx].copy(mMagRefsInBodyFrame[mMagNumReferences]);
    			mMagRefsInWorldFrame[mMagRefIdx].copy(mMagRefsInWorldFrame[mMagNumReferences]);
    		}
    		// Find a new one
    		mMagRefIdx = -1;
    		mMagRefScore = 1000;
    		var bestDist = maxMagRefDist;
    		for (var i = 0; i < mMagNumReferences; i++) {
    			var dist = calMag.distanceTo(mMagRefsInBodyFrame[i]);
    			if (bestDist > dist) {
    				bestDist = dist;
    				mMagRefIdx = i;
    			}
    		}
    		// Create one if needed
    		if (mMagRefIdx < 0 && mMagNumReferences < MAG_MAX_REFERENCES) {
    			mMagRefIdx = mMagNumReferences;
    			mMagRefsInBodyFrame[mMagRefIdx].copy(calMag);
    			mMagRefsInWorldFrame[mMagRefIdx].copy(calMag.clone().applyQuaternion(mQ).normalize());
    			mMagNumReferences++;
    		}
    	}

    	if (mMagRefIdx >= 0) {
    		var magEstimated = mMagRefsInWorldFrame[mMagRefIdx].clone().applyQuaternion(qInv);
    		var magMeasured = calMag.clone().normalize();

    		// Correction is computed in the horizontal plane (in the world frame)
    		var yawCorrection = computeCorrection(magMeasured.clone().projectOnPlane(up),
    																					magEstimated.clone().projectOnPlane(up));
    		if (Math.abs(up.dot(magEstimated.clone().sub(magMeasured))) < maxTiltError ) {
    			mMagRefScore += 2;
    		}
    		else {
    			// If the vertical angle is wrong, decrease the score
    			mMagRefScore -= 1;
    			proportionalGain = integralGain = 0;
    		}
    		gyroCorrected.add(yawCorrection.clone().multiplyScalar(proportionalGain));
    		mGyroOffset.sub(yawCorrection.clone().multiplyScalar(integralGain).multiplyScalar(mDeltaT));
    	}
    }

    // Update the orientation quaternion based on the corrected angular velocity vector
    mQ.multiply(new THREE.Quaternion().setFromAxisAngle(gyroCorrected.clone().normalize(), gyroCorrected.length() * mDeltaT));

    // The quaternion magnitude may slowly drift due to numerical error,
    // so it is periodically normalized.
    if (mStage % 500 == 0) {
    	mQ.normalize();
    }

	};


	var measuredClone = new THREE.Vector3();
	var estimatedClone = new THREE.Vector3();

	// Compute a rotation required to transform "estimated" into "measured"
	// Returns an approximation of the goal rotation in the Simultaneous Orthogonal Rotations Angle representation
	// (vector direction is the axis of rotation, norm is the angle)
	var computeCorrection = function(measured, estimated) {
		measuredClone.copy(measured).normalize();
		estimatedClone.copy(estimated).normalize();

		var cosError = measuredClone.dot(estimatedClone);

		var correction = measuredClone.cross(estimatedClone);

		// from the def. of cross product, correction.Length() = sin(error)
    // therefore sin(error) * sqrt(2 / (1 + cos(error))) = 2 * sin(error / 2) ~= error in [-pi, pi]
    // Mathf::Tolerance is used to avoid div by 0 if cos(error) = -1

    return correction.multiplyScalar( Math.sqrt( 2.0 / (1 + cosError + MATHF_TOLERANCE) ) );
	};





	var getCalibratedMagValue = function(rawMag) {
		// uses mMagCalibrationMatrix to transform the rawMag vector
		// the calibration matrix is set via "SetMagCalibration"
		// which uses the calibration data from JSON
		return rawMag.transformDirection(mMagCalibrationMatrix);
	};





	// Store the calibration matrix for the magnetometer
	// m is Matrix4f
	var setMagCalibration = function(m) {
		mMagCalibrationMatrix.copy(m);
		mMagCalibrationTime = new Date();
		mMagCalibrated = true;
	};

	// http://stackoverflow.com/questions/3362471/how-can-i-call-a-javascript-constructor-using-call-or-apply
	function applyToConstructor(constructor, argArray) {
    var args = [null].concat(argArray);
    var factoryFunction = constructor.bind.apply(constructor, args);
    return new factoryFunction();
	}

	// Loads a saved calibration for the specified device from the device profile file
	// original function loads from file -- this one will be given the JSON
	var loadMagCalibration = function(calibrationName, devicesJson) {
		// A named calibration may be specified for calibration in different
    // environments, otherwise the default calibration is used
    calibrationName = typeof calibrationName !== 'undefined' ? calibrationName : "default";

    log("loading mag calibration for '" + calibrationName + "'");
    log(devicesJson);
    // Load the device profiles from Devices.json

		if (devicesJson === null) {
			return false;
		}

		// Quick sanity check of the file type and format before we parse it
		if (devicesJson.hasOwnProperty("Oculus Device Profile Version")) {
			var major = parseFloat(devicesJson["Oculus Device Profile Version"]);
			if (major > MAX_DEVICE_PROFILE_MAJOR_VERSION) {
				return false; 	// don't parse the file on unsupported major version number
			}
		} else {
			return false;
		}

		var autoEnableCorrection = false;

		// TODO: how to handle multiple devices?

		// Search for a previous calibration with the same name for this device
    // and remove it before adding the new one
		var devices = devicesJson["Device"];
		log("devices:", devices);

		for (var i = 0; i < devices.length; i++) {
			var device = devices[i];

			if (device !== null) {
				var serial = device["Serial"];

				if (true) {	// TODO, need to check our serial against CachedSensorInfo.SerialNumber
					// found an entry for this device

					if(device["EnableYawCorrection"]) {
						autoEnableCorrection = true;
					}

					var maxCalibrationVersion = 0;
					var magCalibration = device["MagCalibration"];
					if (magCalibration && magCalibration["Name"] === calibrationName) {
						// found a calibration of the same name

						var major = 0;
						var magCalibrationVersion = magCalibration["Version"];
						if (magCalibrationVersion) {
							major = parseFloat(magCalibrationVersion);
						}

						if (major > maxCalibrationVersion && major <= 2) {

							var calibration_time = magCalibration["Time"] ? new Date(magCalibration["Time"]) : new Date();

							// parse the calibration matrix
							var cal = magCalibration["CalibrationMatrix"];
							if (!cal) {
								cal = magCalibration["Calibration"];
							}

							if (cal) {
								var calmatArray = cal.trim().split(" ").map(parseFloat);
								log("calmatArray", calmatArray);
								var calmat = applyToConstructor(THREE.Matrix4, calmatArray);
								setMagCalibration(calmat);
								mMagCalibrationTime = calibration_time;
								mEnableYawCorrection = autoEnableCorrection;

								maxCalibrationVersion = major;
							}
						}
					}
					return (maxCalibrationVersion > 0);
				}
			}

		}
		
		return false;
	};



	var deltaQP = new THREE.Quaternion();
	var qP = new THREE.Quaternion();

	//  A predictive filter based on extrapolating the smoothed, current angular velocity
	// Get predicted orientaion in the near future; predictDt is lookahead amount in seconds.
	var getPredictedOrientation = function(pdt) {
		predictDt = typeof pdt !== 'undefined' ? pdt : mPredictionDT;

		qP.copy(mQ);

		if (mEnablePrediction) {
			// This method assumes a constant angular velocity
			var angVelF = mFAngV.savitzkyGolaySmooth8();

			var angVelFL = angVelF.length();

			// Force back to raw measurement
			angVelF.copy(mAngV);
			angVelFL = mAngV.length();

			// Dynamic prediction interval: Based on angular velocity to reduce vibration
			var minPdt = 0.001;
			var slopePdt = 0.1;
			var newpdt = predictDt;
			var tpdt = minPdt + slopePdt * angVelFL;

			if (tpdt < predictDt) {
				newpdt = tpdt;
			}

			if (angVelFL > 0.001) {
				var rotAxisP 			= angVelF.normalize();

				var halfRotAngleP = angVelFL * newpdt * 0.5;

				var sinaHRAP 			= Math.sin(halfRotAngleP);

				deltaQP.set(rotAxisP.x * sinaHRAP,
										rotAxisP.y * sinaHRAP,
										rotAxisP.z * sinaHRAP,
										Math.cos(halfRotAngleP));

				qP.multiply(deltaQP);
			}
		}
		return qP;
	};



	return {
		'handleMessage': handleMessage,
		'getPredictedOrientation': getPredictedOrientation,
		'updateOrientationFromTrackerMessage': updateOrientationFromTrackerMessage,
		'loadMagCalibration': loadMagCalibration
	};
};
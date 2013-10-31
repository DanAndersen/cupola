var SensorFusion = function() {

	var mEnablePrediction = true;
	var mEnableGravity = true;
	var mEnableYawCorrection = false;
	var mMotionTrackingEnabled = true;
	var mMagCalibrated = false;
	
	var mGain = 0.05;

	var mPredictionDT = 0.03;	// default lookahead time in seconds

	var MATHF_TOLERANCE = 0.00001;

	var mFRawMag = new SensorFilterVector3(10);
	var mFAngV = new SensorFilterVector3(10);

	var mTiltAngleFilter = new SensorFilterScalar(1000);

	// when loaded from calibration, this will be different
	var mMagCalibrationMatrix = new THREE.Matrix4().identity();

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


	var isMotionTrackingEnabled = function() {
		return mMotionTrackingEnabled;
	}

	var handleMessage = function(msg) {

		if (!(msg instanceof MessageBodyFrame) || !isMotionTrackingEnabled()) {
			return;
		}

		// Put the sensor readings into convenient local variables
		var gyro = msg.rotationRate;
		var accel = msg.acceleration;
		var mag = msg.magneticField;

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
		var qInv = new mq.clone().inverse();
		var up = new THREE.Vector3(0,1,0).applyQuaternion(qInv);

		var gyroCorrected = new gyro.clone();

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


	// Compute a rotation required to transform "estimated" into "measured"
	// Returns an approximation of the goal rotation in the Simultaneous Orthogonal Rotations Angle representation
	// (vector direction is the axis of rotation, norm is the angle)
	var computeCorrection = function(measured, estimated) {
		var measuredClone = new measured.clone();
		var estimatedClone = new estimated.clone();

		measuredClone.normalize();
		estimatedClone.normalize();

		var correction = new measuredClone.clone().cross(estimatedClone);

		var cosError = measuredClone.dot(estimatedClone);

		// from the def. of cross product, correction.Length() = sin(error)
    // therefore sin(error) * sqrt(2 / (1 + cos(error))) = 2 * sin(error / 2) ~= error in [-pi, pi]
    // Mathf::Tolerance is used to avoid div by 0 if cos(error) = -1

    return correction.clone().multiplyScalar( Math.sqrt( 2.0 / (1 + cosError + MATHF_TOLERANCE) ) );
	};





	var getCalibratedMagValue = function(rawMag) {
		// uses mMagCalibrationMatrix to transform the rawMag vector
		// the calibration matrix is set via "SetMagCalibration"
		// which uses the calibration data from JSON
		return rawMag.transformDirection(mMagCalibrationMatrix);
	};



	//  A predictive filter based on extrapolating the smoothed, current angular velocity
	// Get predicted orientaion in the near future; predictDt is lookahead amount in seconds.
	var getPredictedOrientation = function(pdt) {
		predictDt = typeof a !== 'undefined' ? a : mPredictionDT;

		var qP = mQ.clone();

		if (mEnablePrediction) {
			// This method assumes a constant angular velocity
			var angVelF = mFAngV.savitzkyGolaySmooth8();
			var angVelFL = angVelF.length();

			// Force back to raw measurement
			angvelF.copy(mAngV);
			angVelFL = mAngV.length();

			// Dynamic prediction interval: Based on angular velocity to reduce vibration
			var minPdt = 0.001;
			var slopePdt = 0.1;
			var newpdt = pdt;
			var tpdt = minPdt + slopePdt * angVelFL;
			if (tpdt < pdt) {
				newpdt = tpdt;
			}

			if (angVelFL > 0.001) {
				var rotAxisP 			= angVelF.clone().normalize();
				var halfRotAngleP = angVelFL * newpdt * 0.5;
				var sinaHRAP 			= Math.sin(halfRotAngleP);

				var deltaQP = new THREE.Quaternion(	rotAxisP.x * sinaHRAP,
																						rotAxisP.y * sinaHRAP,
																						rotAxisP.z * sinaHRAP,
																						Math.cos(halfRotAngleP));

				qP = mQ.clone().multiply(deltaQP);
			}
		}
		return qP;
	};





	return {
		'handleMessage': handleMessage,
		'getPredictedOrientation': getPredictedOrientation
	};
};
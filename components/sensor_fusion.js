var SensorFusion = function() {

	var mMotionTrackingEnabled = true;
	var mMagCalibrated = false;
	var mFRawMag = new SensorFilter(10);
	var mFAngV = new SensorFilter(10);

	var mMagCalibrationMatrix = new THREE.Matrix4(1.64133, 0.0141079, -0.0108806, -0.166527,
																							 	0.0141079, 1.41594, -0.0342712, 0.643716, 
																							 	-0.0108806, -0.0342712, 1.56853, 1.05617,
																							 	0, 0, 0, 1);

	var mDeltaT = 0;
	var mAngV = new THREE.Vector3();
	var mA = new THREE.Vector3();
	var mRawMag = new THREE.Vector3();
	var mCalMag = new THREE.Vector3();

	var mStage = 0;
	var mRunningTime = 0;

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
		

	};


	var getCalibratedMagValue = function(rawMag) {
		// uses mMagCalibrationMatrix to transform the rawMag vector
		// the calibration matrix is set via "SetMagCalibration"
		// which uses the calibration data from JSON
		return rawMag.transformDirection(mMagCalibrationMatrix);
	};


	return {
		'handleMessage': handleMessage
	};
};
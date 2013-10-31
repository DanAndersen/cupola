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
		log("sensor timedelta: " + mSensors.timeDelta);

		for (var i = 0; i < iterations; i++) {
			log("iteration #" + i);
			mSensors.setAcceleration(msg.getSamples()[i].mAcc);
			mSensors.setRotationRate(msg.getSamples()[i].mGyro);
			mSensors.setMagneticField(msg.getMag());
			mSensors.setTemperature(msg.getTemperature());
			log("\tacceleration: " + JSON.stringify(mSensors.acceleration);
			log("\tRotationRate: " + JSON.stringify(mSensors.rotationRate);
			log("\tMagneticField: " + JSON.stringify(mSensors.magneticField);
			log("\tTemperature: " + mSensors.temperature;

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

		mAngV.copy(sensors.rotationRate;
		log("mAngV before: " + JSON.stringify(mAngV));
		mAngV.y *= YAW_MULT;
		log("mAngV after: " + JSON.stringify(mAngV));

		mA.copy(sensors.acceleration.multiplyScalar(sensors.timeDelta;

		dV.copy(mAngV).multiplyScalar(sensors.timeDelta;
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

		var accelMagnitude = sensors.acceleration.length();
		var angVMagnitude = mAngV.length();
		var gravityEpsilon = 0.4;
		var angVEpsilon = 3.0;

		log("accelMagnitude: " + accelMagnitude);

		if (ENABLE_GRAVITY && 
			(Math.abs(accelMagnitude - 9.81) < gravityEpsilon) &&
			(angVMagnitude < angVEpsilon)) {

			yUp.set(0,1,0);

			aw = mA.applyQuaternion(mOrientation);
			//aw = rotate(aw, mOrientation, mA);

			feedback.set(
				-aw.z * GAIN,
				0,
				aw.x * GAIN,
				1);

			q1.copy(feedback).multiply(mOrientation);
			q1.normalize();

			var angle0 = angleBetween(yUp, aw);
			log("angle0: " + angle0);

			tempV = mA.applyQuaternion(q2);
			//tempV = rotate(tempV, q2, mA);
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

				tempV = mA.applyQuaternion(q2);
				//tempV = rotate(tempV, q2, mA);
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
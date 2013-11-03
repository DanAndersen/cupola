var MessageBodyFrame = function(acc, rotRate, mag, temp, tDelta) {
	this.acceleration = acc || new THREE.Vector3();
	this.rotationRate = rotRate || new THREE.Vector3();
	this.magneticField = mag || new THREE.Vector3();
	this.temperature = temp || 0;
	this.timeDelta = tDelta || 0;
};

MessageBodyFrame.prototype = {
	constructor: MessageBodyFrame,

	setAcceleration: function (acc) {
		this.acceleration = acc;
		return this;
	},
	setRotationRate: function (rotRate) {
		this.rotationRate = rotRate;
		return this;
	},
	setMagneticField: function (mag) {
		this.magneticField = mag;
		return this;
	},
	setTemperature: function (temp) {
		this.temperature = temp;
		return this;
	},
	setTimeDelta: function (tDelta) {
		this.timeDelta = tDelta;
		return this;
	}
};
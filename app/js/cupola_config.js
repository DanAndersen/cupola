/*
var c = new CupolaConfig({
	hResolution: 1920, 
	vResolution: 1080, 
	interpupillaryDistance: 0.068200,
	playerHeight: 1.803400, 
	gender: "Male"
});
*/

var CupolaConfig = function(inputs) {

	inputs = typeof inputs !== 'undefined' ? inputs : {};

	var DEFAULT_HRES = 1280;
	var DEFAULT_VRES = 800;
	var DEFAULT_PLAYER_HEIGHT = 1.778;
	var DEFAULT_GENDER = "Unspecified";
	var DEFAULT_IPD = 0.064;

	var IS_7_INCH = inputs.is7Inch || true; // TODO; hardcoding this to DevKit 1

	var hResolution = inputs.hResolution || DEFAULT_HRES;
	var vResolution = inputs.vResolution || DEFAULT_VRES;
	var interpupillaryDistance = inputs.interpupillaryDistance || DEFAULT_IPD;
	var playerHeight = inputs.playerHeight || DEFAULT_PLAYER_HEIGHT;
	var gender = inputs.gender || DEFAULT_GENDER;

	var hScreenSize, vScreenSize;
	var eyeToScreenDistance;
	var distortionK;

	// DistortionFn applies distortion equation to the argument. The returned
  // value should match distortion equation used in shader.
  var distortionFn = function (r) {        
      var rsq   = r * r;
      var scale = r * (distortionK[0] + distortionK[1] * rsq + distortionK[2] * rsq * rsq + distortionK[3] * rsq * rsq * rsq);
      return scale;
  };

	if (IS_7_INCH) {	// DK1
		eyeToScreenDistance = 0.041;
		hScreenSize = 0.14976;
		vScreenSize = 0.0936;
		distortionK = [1.0, 0.22, 0.24, 0];
	} else {
		if (hResolution >= 1920) {
			// HD DK
			eyeToScreenDistance = 0.040;
			hScreenSize = 0.12096;
			vScreenSize = 0.06804;
		} else {
			// DK1 prototype
			eyeToScreenDistance = 0.0387;
			hScreenSize = 0.12096;
			vScreenSize = 0.0756;
		}
		distortionK = [1.0, 0.18, 0.115, 0];
	}

	var lensSeparationDistance = 0.0635;
	var vScreenCenter = vScreenSize * 0.5;
	var chromaAbParameter = [0.996, -0.004, 1.014, 0];

	// find FOV

	var MODE_STEREO_NONE = false;	// hardcoded to false

	var fovDegrees;
	if (MODE_STEREO_NONE) {
		fovDegrees = 80;
	} else {

		// Distortion center shift is stored separately, since it isn't affected
    // by the eye distance.
		var lensOffset = lensSeparationDistance * 0.5;
		var lensShift = hScreenSize * 0.25 - lensOffset;
		var lensViewportShift = 4.0 * lensShift / hScreenSize;
		var xCenterOffset = lensViewportShift;

		var distortionScale;

		// Compute distortion scale from DistortionFitX & DistortionFitY.
    // Fit value of 0.0 means "no fit".
		if ((Math.abs(distortionFitX) < 0.0001) && (Math.abs(distortionFitY) < 0.0001)) {
			distortionScale = 1.0;
		}
		else {


			// Fit left of the image.
    	var distortionFitX = -1.0;
    	var distortionFitY = 0.0;

    	var fullView = {
    		x: 0,
    		y: 0,
    		w: 1280,
    		h: 800
    	};

			// Convert fit value to distortion-centered coordinates before fit radius
	    // calculation.
	    var stereoAspect = 0.5 * fullView.w / fullView.h;
	    var dx = distortionFitX - xCenterOffset;
	    var dy = distortionFitY / stereoAspect;
			var fitRadius = Math.sqrt(dx * dx + dy * dy);
			var distortionScale = distortionFn(fitRadius)/fitRadius;
		}
		
		var perceivedHalfRTDistance = (vScreenSize / 2) * distortionScale;
		var fovRadians = 2 * Math.atan(perceivedHalfRTDistance / eyeToScreenDistance);
		var fovDegrees = fovRadians * 180 / Math.PI;
	}

	

	return {
		"FOV"                       : fovDegrees,
    "hScreenSize"               : hScreenSize,
    "vScreenSize"               : vScreenSize,
    "vScreenCenter"             : vScreenCenter,
    "eyeToScreenDistance"       : eyeToScreenDistance,
    "lensSeparationDistance"    : lensSeparationDistance,
    "interpupillaryDistance"    : interpupillaryDistance,
    "hResolution"               : hResolution,
    "vResolution"               : vResolution,
    "distortionK"               : distortionK,
    "chromaAbParameter"         : chromaAbParameter,
    "gender"										: gender,
    "playerHeight"							: playerHeight
	};
};
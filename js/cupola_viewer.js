var usb = new CupolaServer();

var webview = document.getElementById("sim-webview");
var urlTextInput = document.getElementById("url-bar");
var urlSubmitButton = document.getElementById("url-submit");

var LATEST_CUPOLA_MESSAGE_VERSION = "1";

//===========================

var submitUrl = function(newUrl) {

	if (!newUrl.match(/^[a-zA-Z]+:\/\//))
	{
	    newUrl = 'http://' + newUrl;
	}

	console.log("going to url=" + newUrl);
	webview.src = newUrl;
};

function viewerToggleFullscreen() {
	console.log("toggling fullscreen");

	var appWindow = chrome.app.window.current();

	if (appWindow.isFullscreen()) {
		appWindow.restore();
	} else {
		appWindow.fullscreen();
	}
}

function viewerConnect() {
	console.log("connect button pressed");
	chrome.permissions.request( usb.getPermissionObject(), function(result) {
    if (result) {
    	console.log("got permission");
      usb.connect();
    } else {
      console.log('App was not granted the "usbDevices" permission.');
      console.log(chrome.runtime.lastError);
    }
  });
}

function viewerDisconnect() {
	console.log("disconnect button pressed");
	usb.disconnect();
}

function viewerSendConfig() {
	console.log("sending config to simulation");
	var cupolaConfig = new CupolaConfig();

	sendConfigToSimulation(cupolaConfig);
}

//===========================

var postMessageToSimulation = function(msgObject) {
	webview.contentWindow.postMessage(msgObject, '*');
}

var sendConfigToSimulation = function(configObject) {
	postMessageToSimulation({
		version: LATEST_CUPOLA_MESSAGE_VERSION,
		msg: "config",
		data: configObject
	});
}

var sendOrientationToSimulation = function(quat) {
	postMessageToSimulation({
		version: LATEST_CUPOLA_MESSAGE_VERSION,
		msg: "quat",
		data: {
			x: quat._x, 
			y: quat._y, 
			z: quat._z, 
			w: quat._w
		}
	});
}

//----------------------------

// GUI

var gui = new dat.GUI();

var actionGuiFolder = gui.addFolder('Actions');

var actionObj = {
	sendConfig: viewerSendConfig,
	connect: viewerConnect,
	disconnect: viewerDisconnect,
	toggleFullscreen: viewerToggleFullscreen,
	url: "google.com"
};

actionGuiFolder.add(actionObj, 'sendConfig').name("Send Config");
actionGuiFolder.add(actionObj, 'connect').name("Connect to Rift");
actionGuiFolder.add(actionObj, 'disconnect').name("Disconnect from Rift");
actionGuiFolder.add(actionObj, 'toggleFullscreen').name("Toggle Fullscreen");
actionGuiFolder.add(actionObj, 'url').name("URL").onFinishChange(function(newUrl) {
	submitUrl(newUrl);
});
actionGuiFolder.open();

var configGuiFolder = gui.addFolder('Config');

configGuiFolder.add(usb, 'mPredictDt', 0, 0.1).name("Orientation prediction (sec)");




//===========================




var profiles = {
	"Oculus Profile Version":	1,
	"CurrentProfile":	"Daniel Andersen",
	"ProfileCount":	1,
	"Profile":	{
		"Name":	"Daniel Andersen",
		"Gender":	"Male",
		"PlayerHeight":	1.803400,
		"IPD":	0.068200,
		"RiftDK1":	{
			"EyeCup":	"A",
			"LL":	180,
			"LR":	617,
			"RL":	685,
			"RR":	1108
		}
	}
};

var devices = {
	"Oculus Device Profile Version":	"1.0",
	"Device":	{
		"Product":	"Tracker DK",
		"ProductID":	1,
		"Serial":	"OOKAI3TGQK37",
		"EnableYawCorrection":	true,
		"MagCalibration":	{
			"Version":	"2.0",
			"Name":	"default",
			"Time":	"2013-10-12 08:07:58",
			"CalibrationMatrix":	"1.64133 0.0141079 -0.0108806 -0.166527 0.0141079 1.41594 -0.0342712 0.643716 -0.0108806 -0.0342712 1.56853 1.05617 0 0 0 1 ",
			"Calibration":	"1 0 0 -0.100989 0 1 0 0.472158 0 0 1 0.682966 0 0 0 1 "
		}
	}
};

var configUtilSettings = {
	"CurProfile":	"Daniel Andersen",
	"Metric":	0
};



//===============================
// JSON Upload stuff






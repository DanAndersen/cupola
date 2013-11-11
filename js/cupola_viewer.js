var usb = new CupolaServer();

var webview = document.getElementById("sim-webview");
var urlTextInput = document.getElementById("url-bar");
var urlSubmitButton = document.getElementById("url-submit");

var LATEST_CUPOLA_MESSAGE_VERSION = "1";


var getCurrentProfileFromProfiles = function(profilesJson) {
	console.log("getCurrentProfileFromProfiles()");

	var currentProfile = profilesJson["CurrentProfile"];

	var profiles = profilesJson["Profile"];
	for (var i = 0; i < profiles.length; i++) {
		var profile = profiles[i];

		if (profile["Name"] === currentProfile) {
			return profile;
		}
	}

	console.log("no profile found for current profile " + currentProfile + ", using first profile");
	return profiles[0];
};

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

	var cupolaConfig;
	if (profilesText) {
		var profilesJson = parseWithDuplicateProfiles(profilesText);
		var currentProfileJson = getCurrentProfileFromProfiles(profilesJson);

		console.log("currentProfileJson", currentProfileJson);

		cupolaConfig = new CupolaConfig(currentProfileJson);
	} else {
		cupolaConfig = new CupolaConfig();
	}

	sendConfigToSimulation(cupolaConfig);
}

//===========================

var postMessageToSimulation = function(msgObject) {
	webview.contentWindow.postMessage(msgObject, '*');
};

var sendConfigToSimulation = function(configObject) {
	postMessageToSimulation({
		version: LATEST_CUPOLA_MESSAGE_VERSION,
		msg: "config",
		data: configObject
	});
};

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
};

var viewerUpdateDeviceConfig = function() {
	console.log("viewerUpdateDeviceConfig()");
	var devicesJson = parseWithDuplicateDevices(devicesText);

	usb.updateDeviceConfig(devicesJson);
};

var uploadStatusDiv = document.getElementById("upload-status");

var onConfigFileUploaded = function(filename, jsonString) {
	if (jsonString.indexOf("Oculus Device Profile Version") >= 0) {
		devicesText = jsonString;

		uploadStatusDiv.innerHTML += "<p class='upload-success'>Set device config from " + filename + "</p>";

		viewerUpdateDeviceConfig();
	} else if (jsonString.indexOf("Oculus Profile Version") >= 0) {
		profilesText = jsonString;

		uploadStatusDiv.innerHTML += "<p class='upload-success'>Set profile config from " + filename + "</p>";

		viewerSendConfig();
	} else {
		console.error("not a valid config file");

		uploadStatusDiv.innerHTML += "<p class='upload-error'>" + filename + " was not a valid config file</p>";
	}
};


var viewerUploadConfigFiles = function() {
	$('#config-upload-modal').modal();

	var cupolaDropzone = new Dropzone("#cupola-dropzone");
	cupolaDropzone.on("addedfile", function(file) {
		console.log("added file:", file);

		var reader = new FileReader();

		reader.onload = (function(theFile) {
			return function(e) {
				console.log("read file " + file.name);
				console.log("result: ", e.target.result);

				onConfigFileUploaded(file.name, e.target.result);
			};
		})(file);

		reader.readAsText(file);

	});
};

//----------------------------

// GUI

var gui = new dat.GUI();

var actionGuiFolder = gui.addFolder('Actions');

var actionObj = {
	sendConfig: viewerSendConfig,
	connect: viewerConnect,
	disconnect: viewerDisconnect,
	toggleFullscreen: viewerToggleFullscreen,
	url: "google.com",
	updateDeviceConfig: viewerUpdateDeviceConfig,
	uploadConfigFiles: viewerUploadConfigFiles
};

actionGuiFolder.add(actionObj, 'sendConfig').name("Send Config");
actionGuiFolder.add(actionObj, 'connect').name("Connect to Rift");
actionGuiFolder.add(actionObj, 'disconnect').name("Disconnect from Rift");
actionGuiFolder.add(actionObj, 'toggleFullscreen').name("Toggle Fullscreen");
actionGuiFolder.add(actionObj, 'url').name("URL").onFinishChange(function(newUrl) {
	submitUrl(newUrl);
});
actionGuiFolder.add(actionObj, 'updateDeviceConfig').name("Update Device Config");
actionGuiFolder.add(actionObj, 'uploadConfigFiles').name("Upload Config Files");
actionGuiFolder.open();

var configGuiFolder = gui.addFolder('Config');

configGuiFolder.add(usb, 'mPredictDt', 0, 0.1).name("Orientation prediction (sec)");

//===========================







var profilesText;

var devicesText;


//===============================
// JSON Upload stuff





// This is done because the Oculus JSON has duplicate keys for "Profile",
// which it really shouldn't have. If any Oculus devs are reading this, 
// I recommend migrating to a format where "Profile" becomes a JSON array.
function parseWithDuplicateProfiles(text) {

	// replaces first occurrence of Profile
	text = text.replace("\"Profile\":","\"Profile\":[");

	// regex for last "}" at end of JSON, puts an end array before it
	text = text.replace(/\}[^\}]*$/, "]}");

	// removes any '"Profile":' that has a curly brace and not the array start
	// i.e.: removes all profile keys but the first
	text = text.replace(/\"Profile\":[ \t]*{/g, "{");

	return JSON.parse(text);
}




// This is done because the Oculus JSON has duplicate keys for "Device",
// which it really shouldn't have. If any Oculus devs are reading this, 
// I recommend migrating to a format where "Device" becomes a JSON array.
function parseWithDuplicateDevices(text) {

	// replaces first occurrence of Device
	text = text.replace("\"Device\":","\"Device\":[");

	// regex for last "}" at end of JSON, puts an end array before it
	text = text.replace(/\}[^\}]*$/, "]}");

	// removes any '"Device":' that has a curly brace and not the array start
	// i.e.: removes all profile keys but the first
	text = text.replace(/\"Device\":[ \t]*{/g, "{");

	return JSON.parse(text);
}


//=============
// Drag-and-drop upload

Dropzone.options.cupolaDropzone = {
	dictDefaultMessage: "Drop Oculus configuration files here to upload",
	autoProcessQueue: false
};

Dropzone.autoDiscover = false;

var usb = new CupolaServer();

var webview = document.getElementById("sim-webview");

var urlTextInput = document.getElementById("url-bar");
var urlSubmitButton = document.getElementById("url-submit");



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





var sendOrientationToSimulation = function(quat) {
	webview.contentWindow.postMessage({x: quat._x, y: quat._y, z: quat._z, w: quat._w}, '*');
}


//----------------------------

// GUI

var gui = new dat.GUI();

var actionGuiFolder = gui.addFolder('Actions');

var actionObj = {
	connect: viewerConnect,
	disconnect: viewerDisconnect,
	toggleFullscreen: viewerToggleFullscreen,
	url: "google.com"
};

actionGuiFolder.add(actionObj, 'connect').name("Connect to Rift");
actionGuiFolder.add(actionObj, 'disconnect').name("Disconnect from Rift");
actionGuiFolder.add(actionObj, 'toggleFullscreen').name("Toggle Fullscreen");
actionGuiFolder.add(actionObj, 'url').name("URL").onFinishChange(function(newUrl) {
	submitUrl(newUrl);
});
actionGuiFolder.open();

var configGuiFolder = gui.addFolder('Config');

configGuiFolder.add(usb, 'mPredictDt', 0, 0.1).name("Orientation prediction (sec)");
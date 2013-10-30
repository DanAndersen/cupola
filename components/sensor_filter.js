var capacity = 10;



var mCapacity = capacity || 20;
var mRunningTotal = new THREE.Vector3();
var mElements = [];
var mLastIdx = -1;
var mCount = 0;

// initialize each element of circular buffer
for (var i = 0; i < mCapacity; i++) {
  mElements[i] = new THREE.Vector3();
}

// Add a new element to the filter
// Updates the running sum value
var addElement = function(e) {
	var nextIdx = (mLastIdx + 1) % mCapacity;

	mRunningTotal.set(mRunningTotal.x + e.x - mElements[nextIdx].x,
										mRunningTotal.y + e.y - mElements[nextIdx].y,
										mRunningTotal.z + e.z - mElements[nextIdx].z);

	// circular buffer add element
	mLastIdx = (mLastIdx + 1) % mCapacity;
	mElements[mLastIdx].copy(e);
	if (mCount < mCapacity) {
		mCount++;
	}
	// end circular buffer add element
	if (mLastIdx == 0) {
		// update the cached total to avoid error accumulation
		mRunningTotal.set(0,0,0);
		for (var i = 0; i < mCount; i++) {
			mRunningTotal.set(mRunningTotal.x + mElements[i].x,
												mRunningTotal.y + mElements[i].y,
												mRunningTotal.z + mElements[i].z);
		}
	}
};

var mean = function() {
  return (mCount == 0) ? 
    new THREE.Vector3() : 
    new THREE.Vector3(mRunningTotal.x / mCount, 
                      mRunningTotal.y / mCount, 
                      mRunningTotal.z / mCount);
};
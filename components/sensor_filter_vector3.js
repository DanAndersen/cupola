var SensorFilterVector3 = function(capacity) {

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

  // Get element i.  0 is the most recent, 1 is one step ago, 2 is two steps ago, ...
  var getPrev = function(i) {
    i = typeof i !== 'undefined' ? i : 0;

    if (i >= mCount) {
      // return 0 if the filter doesn't have enough elements
      return new THREE.Vector3();
    }
    var idx = (mLastIdx - i);
    if (idx < 0) {
      // Fix the wraparound case
      idx += mCapacity;
    }
    return mElements[idx].clone();
  };

  var mean = function() {
    return (mCount == 0) ? 
      new THREE.Vector3() : 
      new THREE.Vector3(mRunningTotal.x / mCount, 
                        mRunningTotal.y / mCount, 
                        mRunningTotal.z / mCount);
  };

  var savitzkyGolaySmooth8 = function() {
    return getPrev(0).multiplyScalar(0.41667)
      .add(getPrev(1).multiplyScalar(0.33333))
      .add(getPrev(2).multiplyScalar(0.25))
      .add(getPrev(3).multiplyScalar(0.16667))
      .add(getPrev(4).multiplyScalar(0.08333))
      .sub(getPrev(6).multiplyScalar(0.08333))
      .sub(getPrev(7).multiplyScalar(0.16667));
  };

  return {
    'addElement': addElement,
    'mean': mean,
    'savitzkyGolaySmooth8': savitzkyGolaySmooth8
  };
}
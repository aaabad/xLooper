// Signup / directory notices. signupTopic is an ntfy.sh topic name.
// With Firebase filled in below, Firestore is the lasting directory and this
// topic is only the fallback. Set signupTopic to a full https URL to POST the
// same hash JSON to your own backend (name and SHA-256 hashes, never the raw
// email or phone).
window.XLOOPER_CONFIG={
  signupTopic:'xlooper-signups-e6a51d389a90b9453407d779800f61b9',
  // Optional pars and yardages. GolfCourseAPI needs a free key from
  // https://golfcourseapi.com (about 35 requests a day). Leave blank to skip.
  // Paste the key, or the full "Key ..." / "Bearer ..." header value.
  golfCourseApiKey:'',
  // Public web keys only. Leave both blank to keep the phone + ntfy directory
  // (about 12 hours). Never paste a service-account private key.
  // 1. Firebase Spark project + Firestore database.
  // 2. Authentication → Anonymous → Enable.
  // 3. Publish firestore.rules from this repo.
  // 4. Project settings → Web app → copy apiKey and projectId.
  firebase:{
    apiKey:'',
    projectId:''
  }
};

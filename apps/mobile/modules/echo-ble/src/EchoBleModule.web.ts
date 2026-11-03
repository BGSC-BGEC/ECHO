const unsupported = () => Promise.reject(new Error('Slash needs an Android phone with the latest ECHO build'));
export default { state: () => 'unsupported' as const, canAdvertise: () => false, startAdvertising: unsupported, stopAdvertising: () => Promise.resolve(), scan: unsupported };

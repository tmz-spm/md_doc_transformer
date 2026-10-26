// Browser-only adapter for omml2mathml. Avoid installing get-dom's obsolete Node/jsdom stack.
exports.document = () => document.implementation.createDocument(null, null);
exports.implementation = () => document.implementation;

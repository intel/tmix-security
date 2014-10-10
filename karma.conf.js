// For documentation see: http://karma-runner.github.io/0.10/config/configuration-file.html
module.exports = function (config) {
	config.set({
		basePath: '',
		frameworks: ['jasmine'],
		files: [
			'bower_components/angular/angular.js',
			'bower_components/angular-mocks/angular-mocks.js',
			'tmix-security.js',
			'test/unit.js'
		],
		exclude: [],
		port: 8080,
		logLevel: config.LOG_INFO, // also: LOG_DISABLE || LOG_ERROR || LOG_WARN || LOG_INFO || LOG_DEBUG
		autoWatch: false,
		browsers: ['PhantomJS'], // also: Firefox, IE, Chrome
		singleRun: true,
		// setup coverage reports
		preprocessors: {
			'tmix-security.js': ['coverage']
		},
		reporters: ['progress', 'coverage'],
		coverageReporter: {type: 'html', dir: 'test/coverage/'},
	});
};

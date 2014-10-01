'use strict';

describe('tmix-security', function () {

	/**
	 * The SecurityProvider object
	 * @type SecurityProvider
	 */
	var Auth;

	/**
	 * Setup fake routes for our app; if you modify this directly in a test,
	 * change it back.
	 * @type object
	 */
	var $route = {"routes": {
			"/": {
				templateUrl: "views/....html",
				controller: "SampleCtrl",
				resolve: ['tmixSecurity'],
				permissions: {canView: ["..."], canEdit: [1, 2, 3]},
				originalPath: "/"
			},
			"/no-permissions": {
				templateUrl: "views/....html",
				controller: "SampleCtrl",
				resolve: ['tmixSecurity'],
				originalPath: "/no-permissions"
			},
			"/route-default-auth": {
				templateUrl: "views/sample.html",
				controller: "SampleCtrl",
				resolve: ['tmixSecurity'],
				permissions: ['/route-default-auth'],
				originalPath: '/route-default-auth'
			},
			"/grab-from-url": {
				templateUrl: "views/sample.html",
				controller: "SampleCtrl",
				resolve: ['tmixSecurity'],
				permissions: 'http://example.com/my-roles', // $httpBackend will return '...'
				originalPath: "/grab-from-url"
			},
			"/override-auth": {
				templateUrl: "views/sample.html",
				controller: "SampleCtrl",
				resolve: ['tmixSecurity'],
				permissions: [1, 2, 3], 
				customAuthorization: function(query, permissions, route, routeParams){
					return (query === 1) ? true : false;
				},
				originalPath: "/override-auth"
			},
			"/test-custom-redirect": {
				templateUrl: "views/sample.html",
				controller: "SampleCtrl",
				resolve: ['tmixSecurity'],
				permissions: {},
				deniedRoute: '/a-different-access-denied',
				originalPath: "/test-custom-redirect"
			},
			"/set-permissions-on-route": {
				templateUrl: "views/sample.html",
				controller: "SampleCtrl",
				originalPath: "/set-permissions-on-route"
			}
		},
		current: {$$route: {}} // set this using setCurrentRoute(); will be reset to '/' before each test
	};

	/**
	 * Convenience method for switching routes
	 * @param {string} routeName
	 * @returns {undefined}
	 */
	var setCurrentRoute = function (routeName) {
		// set path
		inject(function ($location, $rootScope) {
			$location.path(routeName);
			$rootScope.$apply();
		});
		// set current.$route
		if ($route.routes[routeName]) {
			$route.current.$$route = $route.routes[routeName];
		}
		else {
			throw new Error('Not a route: ' + routeName);
		}
	};

	/**
	 * Since setCurrentRoute takes a route path like '/route/:id', not '/route/1',
	 * use this to set the parameters for the route
	 * @param {object} params
	 * @returns {undefined}
	 */
	var setCurrentParams = function (params) {
		$route.current.params = params;
	};

	// see http://stackoverflow.com/questions/14773269
	beforeEach(module('tmix'));
	beforeEach(function () {
		module(function ($provide) {
			$provide.value('$route', $route); // this will be the route within the module
		});
		//$route = angular.copy($route); // reset routes for current context
		setCurrentRoute('/'); // reset current route to root
		setCurrentParams({}); // reset current params
	});
	beforeEach(inject(function (tmixSecurity) {
		Auth = tmixSecurity;
	}));

	afterEach(inject(function ($rootScope) {
		$rootScope.$apply(); // force promises, see http://stackoverflow.com/questions/20311118/
	}));

	/*
	 * toBeTruthy(); toBeFalsy(); toBeDefined(); toBeNull();
	 toEqual(); toBeCloseTo(); toContain(); toMatch();
	 toBeGreaterThan(); toBeLessThan();
	 toThrow();
	 */

	// tests
	it('is injectable into the test runner', function () {
		expect(Auth).toBeTruthy();
	});

	it('should retrieve permissions data from an object in the route declaration', function () {
		// has permissions
		expect(Auth.getPermissionsFromRoute('/')).toMatch({canView: ["..."], canEdit: [1, 2, 3]});
		// does not have permissions
		expect(Auth.getPermissionsFromRoute('/no-permissions')).toBe(undefined);
		// non-existent route
		var tmp = function(){ Auth.getPermissionsFromRoute('/non-existent-route'); };
		expect(tmp).toThrow();
	});

	it('should retrieve permissions data from a URL in the route declaration', inject(function ($injector) {
		// mock HTTP GET
		var $httpBackend = $injector.get("$httpBackend"); // do we really need to $inject first?
		$httpBackend.when('GET', 'http://example.com/my-roles').respond('...');
		// grab permissions
		Auth.getPermissions('/grab-from-url').then(function (data) {
			expect(data).toBe('...');
		}, function () {
			expect('to not be here').toBe(false);
		});
		// ensure backend runs
		$httpBackend.flush();
	}));

	it('should cache permissions once retrieved', inject(function ($http, $injector) {
		// spy on HTTP GET
		var $httpBackend = $injector.get("$httpBackend"); // do we really need to $inject first?
		$httpBackend.when('GET', 'http://example.com/my-roles').respond('RESPONSE 1');
		// get permissions from URL
		Auth.getPermissions('/grab-from-url').then(function (data) {
			expect(data).toBe('RESPONSE 1');
		}, function () {
			expect('to not be here').toBe(false);
		});
		// ensure backend runs
		$httpBackend.flush();
		// switch the permissions sneakily
		$httpBackend.when('GET', 'http://example.com/my-roles').respond('RESPONSE 2');
		// should retrieve from cache, not URL
		var cachedResponse = Auth.getPermissions('/grab-from-url');
		expect($httpBackend.flush).toThrow(); // because there are no pending HTTP requests to flush
		expect(typeof cachedResponse.then).toBe('function'); // shouldn't be a promise
		cachedResponse.then(function(data){
			expect(data).not.toBe('RESPONSE 2');
			expect(data).toBe('RESPONSE 1');
		});		
	}));

	it('should be queryable throughout the application', function () {
		// uses current route's permissions by default; i.e. '/'
		expect(Auth.isAuthorized('canEdit/2')).toBe(true);
		expect(Auth.isAuthorized('canEdit/5')).toBe(false);
		expect(Auth.isAuthorized('canView/...')).toBe(true);
		expect(Auth.isAuthorized('canView/+++')).toBe(false);
		expect(Auth.isAuthorized('test')).toBe(false);
	});

	it('should authorize a bunch of different ways', function () {
		// using '/' route, test a custom route authorization function
		$route.routes['/'].customAuthorization = function (query, permissions, route, routeParams) {
			return permissions.canEdit.indexOf(query) !== -1;
		};
		expect(Auth.isAuthorized(2)).toBe(true);
		expect(Auth.isAuthorized(4)).toBe(false);
		// test a global custom authorization function
		Auth.setCustomAuthorization(function (query) {
			return query === 999;
		});
		expect(Auth.isAuthorized(999)).toBe(false); // why? because we forgot to...
		$route.routes['/'].customAuthorization = null; // unset the overriding route authorization
		expect(Auth.isAuthorized(999)).toBe(true);
		// test function
		Auth.setCustomAuthorization(null); // remember to turn this off, before...
		expect(Auth.isAuthorized(function (itself, permissions) { // we use a lower-priority authorization
			return permissions.canView.length === 1;
		})).toBe(true);
		// test xpath-like query
		expect(Auth.isAuthorized('canView/...')).toBe(true);
		// test route in a route array
		var temp = $route.routes['/'].permissions;
		$route.routes['/'].permissions = ['route/1', 'route/2']; // this is different than the one above because the permissions are in an array of routes
		expect(Auth.isAuthorized('route/1')).toBe(true);
		expect(Auth.isAuthorized('route/2')).toBe(true);
		expect(Auth.isAuthorized('route/3')).toBe(false);
		$route.routes['/'].permissions = temp; // change route permissions back
	});

	it('should authorize the current path from a permissions array by default', function () {
		// sort of a duplicate of the last case above, but with redirection
		setCurrentRoute('/route-default-auth');
		Auth.authorizeOrRedirect().then(function (authorized) {
			expect(authorized).toBe(true);
		}, function (authorized) {
			expect('to not be here').toBe(false);
		});
	});

	it('should override the isAuthorized method with a custom function', function () {
		Auth.setCustomAuthorization(function (query, permissions, route, routeParams) {
			if (permissions.canEdit.length === 3) {
				return true;
			}
			return false;
		});
		Auth.authorizeOrRedirect().then(function (authorized) {
			expect(authorized).toBe(true);
		}, function (authorized) {
			expect('to not be here').toBe(false);
		});
	});
	
	it('can override the isAuthorized method with a custom function in the route object', function () {
		setCurrentRoute('/override-auth');
		Auth.authorizeOrRedirect().then(function (authorized) {
			expect('to not be here').toBe(false);
		}, function (authorized) {
			// not authorized because the query being passed to the custom
			// auth function is the route path, '/override-auth'
			expect(authorized).toBe(false); 
		});
		// is authorized because we are passing in the only good query, 1
		expect(Auth.isAuthorized(1)).toBe(true);
	});

	it('should redirect unauthorized route requests', inject(function ($location) {
		spyOn($location, 'path').andCallThrough();
		Auth.authorizeOrRedirect().then(function (authorized) {
			expect('to not be here').toBe(false);
		}, function (authorized) {
			expect(authorized).toBe(false);
			expect($location.path).toHaveBeenCalledWith('/forbidden');
		});
	}));

	it('should redirect unauthorized route requests to a custom URL', inject(function ($location, $rootScope) {
		// set new route
		setCurrentRoute('/test-custom-redirect');
		// now check path
		spyOn($location, 'path').andCallThrough();
		Auth.authorizeOrRedirect().then(function (authorized) {
			expect('to not be here').toBe(false);
		}, function (authorized) {
			expect(authorized).toBe(false);
			expect($location.path).toHaveBeenCalledWith('/a-different-access-denied');
		});
	}));

	it('should be able to find query strings like "path/2" in the permissions object', function () {
		var permissions = {GET: {page: [1, 2, 3], other: [1, 'a/b']}, PUT: {page: [1]}};
		expect(Auth.findIn('GET/page/1', permissions)).toBe(true);
		expect(Auth.findIn('GET/page/4', permissions)).toBe(false);
		expect(Auth.findIn('PUT/page', permissions)).toBe(true);
		expect(Auth.findIn('PUT/././.', permissions)).toBe(false);
		expect(Auth.findIn('GET#other#a/b', permissions, '#')).toBe(true);
		expect(Auth.findIn('GET#page/1', permissions, '#')).toBe(false);
	});

	it('can change its default access strategy (default allow, default deny)', function () {
		setCurrentRoute('/no-permissions');
		expect(Auth.isAuthorized()).toBe(false);
		Auth.setDefaultAccess(true);
		expect(Auth.isAuthorized()).toBe(true);
		Auth.setDefaultAccess(false);
		expect(Auth.isAuthorized()).toBe(false);
	});

	it('will use default permissions if no route permissions are available', inject(function ($injector) {
		// mock HTTP GET
		var $httpBackend = $injector.get("$httpBackend"); // do we really need to $inject first?
		$httpBackend.when('GET', 'http://example.com/my-roles').respond('...');
		// set current route
		setCurrentRoute('/no-permissions');

		// set as an object
		Auth.setDefaultPermissions([1, 2, 3]);
		Auth.setCustomAuthorization(function (query, permissions, route, routeParams) {
			expect(permissions).toMatch([1, 2, 3]);
			return true;
		});
		Auth.isAuthorized();

		// set default as a URL
		Auth.setDefaultPermissions('http://example.com/my-roles');
		Auth.getPermissions().then(function () {
			Auth.isAuthorized();
		});
		Auth.setCustomAuthorization(function (query, permissions, route, routeParams) {
			expect(permissions).toBe('...'); // must be a promise
			return true;
		});

		// ensure backend runs
		$httpBackend.flush();
	}));
	
	it('can set permissions for a route and then use them', function () {
		var permissions = {GET: {page: [1, 2, 3], other: [1, 'a/b']}, PUT: {page: [1]}};
		var routePath = '/set-permissions-on-route'
		Auth.setPermissions(permissions, routePath);
		Auth.getPermissions(routePath).then(function(data){
			expect(data).toBe(permissions);
			expect(Auth.isAuthorized('GET/page/1', routePath)).toBe(true);
		});
	});
});

'use strict';

/**
 * tmix-security: extends backend security to the UI--shouldn't replace 
 * backend security but can make the UI security-aware. Two major use cases:
 *  1. limiting access to a route:
 *		.when('/', {
 *			...
 *			resolve: tmixSecurityProvidef.authorizeOrRedirect,
 *			permissions: 'http://example.com/my-roles'
 *		})
 *	2. changing UI element behavior in controllers:
 *		...
 *		$scope.showEditButton = tmixSecurity.isAuthorized('PUT/resource/' + id);
 *		// in this case, our route permissions would need to be something like {PUT: {resource: [1, 2, 3]}}
 *	
 *	The isAuthorized method allows for several ways to customize how authorization
 *	happens; see documentation for isAuthorized.
 *	
 *	More details at https://github.com/01org/tmix-security
 */

try {
    angular.module('tmix'); // test if the module exists...
} catch (err) {
    angular.module('tmix', []); // ...or create it
}

angular.module('tmix').provider('tmixSecurity', function() {

    /**
     * Store injected services; available after $get runs
     * @type object
     */
    var injects = {};

    /**
     * Store default permissions; will be overriden by specific permissions
     * on a route
     * @type string|object
     */
    var defaultPermissions;

    /**
     * Store permissions retrieved from the server with each URL as the key
     * @type injects.$cacheFactory
     */
    var permissionsCache;

    /**
     * Get the permissions for the given route, or the current route; this method
     * always returns a promise to the permissions.
     * @param {string} A valid route like '/page/:id' (not '/page/3'); if not set, will use the current route
     * @returns {object} Either the permissions or a promise to them
     */
    var getPermissions = function(routePath) {
        // collect permissions from route object
        var routePermissions = getPermissionsFromRoute(routePath);
        // attempt to retrieve a URL from cache 
        var permissions = getPermissionsSync(routePath);
        // case: cache miss
        if (typeof routePermissions === 'string' && typeof permissions === 'undefined') {
            log('Retrieving permissions from a URL; expect a promise for route: ' + routePath);
            return retrievePermissions(routePermissions);
        }
        // case: send route permissions object
        else {
            return injects.$q.when(permissions);
        }
    };

    /**
     * Retrieve permissions synchronously--in other words, not as a promise. This
     * method can return undefined if the cache misses.
     * @param {string} A valid route like '/page/:id' (not '/page/3'); if not set, will use the current route
     * @returns {object} Permissions object or undefined if cache misses
     */
    var getPermissionsSync = function(routePath) {
        var routePermissions = getPermissionsFromRoute(routePath);
        // case: route permissions as URL
        if (typeof routePermissions === 'string') {
            var permissions = permissionsCache.get(routePermissions);
            if (permissions) {
                log('Getting permissions from the cache for route: ' + routePath);
            } else {
                log('Could not find cached permissions for route: ' + routePath);
            }
            return permissions;
        }
        // case: route permissions as object
        else {
            log('Getting permissions from an object for route: ' + routePath);
            return routePermissions;
        }
    };

    /**
     * Attempt to retrieve permissions from the route permissions object. Will
     * pull from the default permissions if the 'permissions' field is falsy.
     * E.g.:
     * 
     *	.when('/', {
     *		...
     *		resolve: ...,
     *		permissions: 'http://example.com/my-roles' // URL case
     *	})
     *	
     *	Or:
     *	
     *	.when('/', {
     *		...
     *		resolve: ...,
     *		permissions: {viewable: [1, 2, 3], editable: [2, 3]} // object case
     *	})
     *	
     * @param {string} A valid route like '/page/:id' (not '/page/3'); if not set, will use the current route
     * @returns {object|string}
     */
    var getPermissionsFromRoute = function(routePath) {
        routePath = routePath || getCurrentRoutePath();
        var route = getRoute(routePath);
        var routePermissions = route.permissions || defaultPermissions; // use default permissions if necessary
        if (!route.permissions) {
            log('Using default permissions.');
        }
        return routePermissions;
    };

    /**
     * Retrieve the current user's permissions from a URL; helper method for
     * getPermissions()
     * @param {string} url
     * @returns {$q.defer.promise}
     */
    var retrievePermissions = function(url) {
        var deferred = injects.$q.defer();
        injects.$http.get(url, { withCredentials: true })
            .then(function(response) {
                var permissions = response.data;
                log('Permissions returned from: ' + url);
                permissionsCache.put(url, permissions);
                deferred.resolve(permissions);
            })
            .catch(function(response) {
                log('Failed to retrieve permissions from: ' + url);
                deferred.reject(response);
            });
        return deferred.promise;
    };

    /**
     * Set the permissions for a route (or the current route, if unspecified)
     * @param {object} permissions
     * @param {string} a valid route, like '/page/:id' (not '/page/3')
     * @returns {undefined}
     */
    var setPermissions = function(permissions, routePath) {
        var route = getRoute(routePath || getCurrentRoutePath());
        log('Manually set permissions on: ' + route);
        route.permissions = permissions;
    };

    /**
     * Set the default permissions
     * @param {object} permissions
     * @returns {undefined}
     */
    var setDefaultPermissions = function(permissions) {
        log('Manually set default permissions; these will be overriden by any specified route permissions.');
        defaultPermissions = permissions;
    };

    /**
     * Clear the retrieved permissions from the cache; this only affects
     * permissions retrieved from an URL (i.e. with retrievePermissions());
     * this means the next getPermissions() call will re-retrieve from the 
     * server.
     * @returns {undefined}
     */
    var clearPermissionsCache = function() {
        permissionsCache.removeAll();
    };

    /**
     * Return a true/false promise stating whether the current authenticated
     * user is permitted to access the current route; will redirect to the
     * access denied route if false. This method is meant to be called from
     * a route resolve, like:
     * 
     * .when('/some/:someField/an-action', {
     *		...
     *		resolve: tmixSecurityProvider.authorizeOrRedirect
     * }
     * 
     * @returns {$q.defer.promise}
     */
    var authorizeOrRedirect = function() {
        var deferred = injects.$q.defer();
        var currentPath = injects.$location.path();
        var permissionsPromise = getPermissions(); // pre-load permissions to populate cache

        // once loaded, test the permissions with isAuthorized()
        permissionsPromise.then(function() {
            // case: we now have permissions, try to authorize
            _authorizeOrRedirect();
        }, function() {
            // case: the promise failed... use defaults to authorize
            log('No permissions, authorizing by default.');
            _authorizeOrRedirect();
        });

        // convenience method for testing authorization once permissions are loaded
        function _authorizeOrRedirect() {
            if (isAuthorized(currentPath)) {
                log('Authorized.');
                deferred.resolve(true);
            } else {
                log('Rejected.');
                deferred.reject(false);
                redirect();
            }
        }

        return deferred.promise;
    };

    /**
     * Redirect to the current route's access denied route
     * @returns {undefined}
     */
    var redirect = function() {
        var newRoute = getAccessDeniedRouteFor(getCurrentRoutePath());
        injects.$location.path(newRoute);
        injects.$location.replace(); // replaces current history so browser back works, see https://docs.angularjs.org/api/ng/service/$location
    };

    /**
     * Determine whether the current query string exists in the permissions
     * object for this route. E.g.:
     * 
     * angular.module('...').controller('MainCtrl', function ($scope, $route, tmixSecurity) {
     *		// or if AuthenticationService has already been used in this route's resolve, just do:
     *		tmixSecurityProvider.isAuthorized('canView/23');
     * }
     * 
     * Custom authorization is prioritized:
     *	1. check for custom route authorization; this is a function assigned to a route like:
     *		.when('/some/:someField/an-action', {
     *			...
     *			resolve: ...,
     *			customAuthorization: function(query, permissions, route, routeParams){ ... },
     *		})
     *	2. check for global custom authorization; this is a function defined like:
     *		tmixSecurityProvider.setCustomAuthorization(function(query, permissions, route, routeParams){
     *			...
     *		});
     *	3. default authorization; the current route is checked against an array of routes in permissions:
     *		// assume we are in '/some-route' the permissions object is ['/', '/some-route', ...]
     *		tmixSecurityProvider.isAuthorized() === true;
     *	4. xpath-like search through the permissions object
     *		// assume permissions like {GET: {route: [1, 2, 3]}}
     *		tmixSecurityProvider.isAuthorized('GET/route/1') === true;
     *		tmixSecurityProvider.isAuthorized('GET#route#1', '#') === true;
     *	5. pass in a function:
     *		tmixSecurityProvider.isAuthorized(function(query, permissions, route, routeParams){
     *			...
     *		});
     *		
     * @param {string} queryString
     * @returns {boolean}
     */
    var isAuthorized = function(query, routePath) {
        routePath = routePath || getCurrentRoutePath();
        var route = getRoute(routePath);
        var routeParams = injects.$route.current.params;
        var permissions = getPermissionsSync(routePath) || {};
        // 1. check for custom route authorization
        if (hasCustomRouteAuthorization(routePath)) {
            log('Authorizing with a custom route function.');
            var method = getCustomRouteAuthorization();
            return !!method(query, permissions, route, routeParams);
        }
        // 2. check for custom authorization function
        else if (hasCustomAuthorization()) {
            log('Authorizing with a custom function.');
            var method = getCustomAuthorization();
            return !!method(query, permissions, route, routeParams);
        }
        // 3. default authorization: check for a route, 'page/2', in a permissions array, ['page/2', 'page/3', ...]
        else if (typeof query === 'string' && permissions instanceof Array) {
            log('Default authorization: looking for a route in a permissions array.');
            return permissions.indexOf(query) !== -1;
        }
        // 4. xpath-like search with a string on a permissions object
        else if (typeof query === 'string') {
            log('Looking for the given query in a permissions object.');
            return findIn(query, permissions);
        }
        // 5. just use a function...
        else if (typeof query === 'function') {
            log('Default authorization: looking for a route in a permissions array.');
            return !!query(query, permissions, route, routeParams);
        } else {
            log('No authorization method found; using default access.');
            return getDefaultAccess();
        }
    };


    /**
     * Find a query like 'path/2/22' in a permissions object
     * @param {string} query
     * @param {object} object
     * @param {string} optionally specify a delimiter
     * @returns {Boolean}
     */
    var findIn = function(query, object, delimiter) {
        var cursor = object;
        var splitQueryString = query.split(delimiter || '/');
        for (var i in splitQueryString) {
            var token = splitQueryString[i];
            // is the token a property name?
            if (typeof cursor[token] !== 'undefined') {
                cursor = cursor[token];
            }
            // or is it in an array?
            else if (cursor instanceof Array && cursor.indexOf(token) !== -1) {
                cursor = cursor[cursor.indexOf(token)];
            }
            // not found...
            else {
                cursor = null;
                break;
            }
        }
        return !!cursor ? true : false;
    };


    /**
     * Set a custom authorization method; this is made public, unlike 
     * the internal hasCustomAuthorization() and getCustomAuthorization()
     * @param {function} callbackFunction
     * @returns {undefined}
     */
    var setCustomAuthorization = function(callbackFunction) {
        customAuthorization = callbackFunction;
    };
    var hasCustomAuthorization = function() {
        return (typeof customAuthorization === 'function');
    };
    var getCustomAuthorization = function() {
        if (!hasCustomAuthorization()) {
            throw new Error('CustomAuthorization is not a function; use setCustomAuthorization(yourAuthorizationFunction)');
        }
        return customAuthorization;
    };
    var customAuthorization;


    /**
     * 
     * @param {object} route
     * @returns {boolean}
     */
    var hasCustomRouteAuthorization = function(routePath) {
        var route = getRoute(routePath);
        return (routePath && typeof route.customAuthorization === 'function');
    };
    var getCustomRouteAuthorization = function(routePath) {
        routePath = routePath || getCurrentRoutePath();
        if (!hasCustomRouteAuthorization(routePath)) {
            throw new Error("The 'customAuthorization' property is not set to a function on: " + routePath);
        }
        return getRoute(routePath).customAuthorization;
    };


    /**
     * Set the default access: true will allow by default, false will deny by
     * default. If no access is set, the provider denies by default.
     * @param {boolean} allowOrDeny
     * @returns {undefined}
     */
    var setDefaultAccess = function(allowOrDeny) {
        defaultAccess = !!allowOrDeny;
    };
    /**
     * Get the default access: true if the provider will allow by default, false
     * if the provider will deny by default.
     * @returns {allowOrDeny|Boolean}
     */
    var getDefaultAccess = function() {
        return defaultAccess;
    };
    var defaultAccess = false;


    /**
     * Return the access denied route for redirecting unauthenticated users.
     * To customize, set the 'sendUnauthenticatedTo' in the route configuration;
     * by default it redirects to '/forbidden'. E.g.:
     * 
     * .when('/some/:someField/an-action', {
     *		...
     *		deniedRoute: '/custom-access-denied-route' // without this, default to '/forbidden'
     * }
     * 
     * @param {string} route
     * @returns {String}
     */
    var getAccessDeniedRouteFor = function(routePath) {
        var route = getRoute(routePath || getCurrentRoutePath());
        if (route.deniedRoute) {
            log('Found an access denied route to: ' + route.deniedRoute);
            return route.deniedRoute;
        }
        return '/forbidden'; // default redirect route
    };

    /**
     * 
     * @param {string} deniedRoute
     * @param {string} routePath
     * @returns {string}
     */
    var setAccessDeniedRouteFor = function(deniedRoute, routePath) {
        var route = getRoute(routePath || getCurrentRoutePath());
        if (!injects.$route.routes[route]) {
            throw new Error('Could not get an access denied route on an unknown route: ' + route);
        }
        route.deniedRoute = deniedRoute;
    };


    /** CONVENIENCE METHODS **/

    /**
     * Return the current route string like '/path/:id'
     * @returns {string}
     */
    var getCurrentRoutePath = function() {
        return injects.$route.current.$$route.originalPath;
    };

    /**
     * Determine if the current route exists
     * @param {string} route
     * @returns {boolean}
     */
    var routeExists = function(route) {
        return !!injects.$route.routes[route];
    };

    /**
     * Convenience method to return the route object for a given routePath
     * @param {string} routePath
     * @returns {injects.$route.routes}
     */
    var getRoute = function(routePath) {
        if (!routeExists(routePath)) {
            throw new Error('Could not find route: ' + routePath);
        }
        return injects.$route.routes[routePath];
    };

    /**
     * Log security messages; off by default
     * @param {string} message
     * @returns {undefined}
     */
    var log = function(message) {
        if (debug) {
            console.log('[tmixSecurityProvider] ' + message);
        }
    };
    var debug = false;
    var turnOffDebugging = function() {
        debug = false;
    };
    var turnOnDebugging = function() {
        debug = true;
    };

    /**
     * Runs when this provider is resolved in .config(); if this isn't run,
     * all of the injects ($route, $q, etc.) won't be available and errors
     * will ensue.
     */
    var $get = [
        '$route', '$cacheFactory', '$q', '$location', '$http',
        function($route, $cacheFactory, $q, $location, $http) {
            // load injects 
            injects.$route = $route;
            injects.$cacheFactory = $cacheFactory;
            injects.$q = $q;
            injects.$location = $location;
            injects.$http = $http;
            // setup the cache
            permissionsCache = injects.$cacheFactory('permissionsCache');
            // return the public API after 'resolve'
            return {
                authorizeOrRedirect: authorizeOrRedirect,
                clearPermissionsCache: clearPermissionsCache,
                findIn: findIn,
                getPermissions: getPermissions,
                getPermissionsSync: getPermissionsSync,
                getPermissionsFromRoute: getPermissionsFromRoute,
                isAuthorized: isAuthorized,
                setPermissions: setPermissions,
                setAccessDeniedRouteFor: setAccessDeniedRouteFor,
                setDefaultPermissions: setDefaultPermissions,
                setCustomAuthorization: setCustomAuthorization,
                setDefaultAccess: setDefaultAccess,
                turnOnDebugging: turnOnDebugging,
                turnOffDebugging: turnOffDebugging
            };
        }
    ];

    /**
     * Public API before 'resolve'; must include $get here so that Angular knows
     * how to create this provider; all injects are unavailable at this stage
     * so methods that rely on them have been removed.
     */
    return {
        $get: $get,
        authorizeOrRedirect: ['tmixSecurity', function(tmixSecurity) {
            tmixSecurity.authorizeOrRedirect();
        }],
        setDefaultPermissions: setDefaultPermissions,
        setCustomAuthorization: setCustomAuthorization,
        setDefaultAccess: setDefaultAccess,
        turnOnDebugging: turnOnDebugging,
        turnOffDebugging: turnOffDebugging
    };
});
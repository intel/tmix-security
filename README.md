# tmix-security

The tmix-security provider is intended to extend backend security into an AngularJS application. It shouldn't replace backend security since AJAX requests can be altered outside the application--it should improve the user experience by making the UI security-aware.

### Install

...

> Note: during development it may be helpful to turn on debugging messages with `tmixSecurity.turnOnDebugging()`.

### Example: Control Routes (The Easy Way)

1. Create a service that returns an array of allowed routes. For example:
```
["/", "/route1", "/route2/:id"]
```

2. Include the tmix-security provider and set the `resolve` and `permissions` property on each route you want to secure:
```
angular.module('exampleApp', [
  'intcNg'
]).config(function($routeProvider) {
    $routeProvider
        .when('/', {
            templateUrl: 'views/templates.html',
            controller: 'TemplatesCtrl',
            resolve: {auth: ['intcSecurity', function(intcSecurity){ return intcSecurity.authorizeOrRedirect(); }]},
            permissions: 'http://example.com/api/Permissions'
        })
        .when('/module/:moduleId', {
            templateUrl: 'views/module.html',
            controller: 'ModuleCtrl',
            resolve: {auth: ['intcSecurity', function(intcSecurity){ return intcSecurity.authorizeOrRedirect(); }]},
            permissions: 'http://example.com/api/Permissions'
        })
        .when('/insecure-route', {
            templateUrl: 'views/insecure.html'         
        })
        .when('/forbidden', {
            templateUrl: 'views/forbidden.html'         
        })
        ...
```

Note: when `permissions` is a string, as in the example, SecurityProvider expects it to be a URL and will attempt to retrieve a permissions object using AJAX; this request will be cached and subsequent requests to the same URL will used the cached response. 

3. Don't forget to setup a `forbidden` route and view for unauthorized requests to redirect to.

### Example: Control Routes (The Advanced Way)

1. Create a service that returns a permissions object. E.g.:
```
{
   userName: "John Smith",
   canView: [1, 2, 3],
   canEdit: [1, 2],
   canDelete: [1]
}
```

2. Include the tmix-security provider and set the `resolve` and `permissions` property on each route you want to secure (see example above).

3. Setup a custom authorization function that will control all routes:
```
angular.module('exampleApp', [
  'intcNg'
]).config(function($routeProvider, tmix-security provider) { 
    // notice that here we use the full name, tmix-security provider
    tmix-security provider.setCustomAuthorization(function(query, permissions, route, routeParams){
        return permissions.canView.indexOf(query) !== -1;
    });
    $routeProvider
        .when('/', {
    ...
```

4. __Alternately__, setup a custom authorization function on a route:
```
angular.module('exampleApp', [
  'intcNg'
]).config(function($routeProvider, int) {
    $routeProvider
        .when('/view/:id', {
            templateUrl: 'views/templates.html',
            controller: 'TemplatesCtrl',
            // notice that here we use the short name, intcSecurity
            resolve: {auth: ['intcSecurity', function(intcSecurity){ return intcSecurity.authorizeOrRedirect(); }]}, 
            permissions: 'http://example.com/api/Permissions',
            customAuthorization: function(query, permissions, route, routeParams){
                return permissions.canView.indexOf(routeParams.id) !== -1;
            });
        })
        .when('/edit/:id', {
            templateUrl: 'views/module.html',
            controller: 'ModuleCtrl',
            resolve: {auth: ['intcSecurity', function(intcSecurity){ return intcSecurity.authorizeOrRedirect(); }]},
            permissions: 'http://example.com/api/Permissions',
            customAuthorization: function(query, permissions, route, routeParams){
                return permissions.canEdit.indexOf(routeParams.id) !== -1;
            })
        });
   });
```

### Example: Use `isAuthorized` in a Controller

The tmix-security provider allows access to its authorization methods from within the controller. Use `isAuthorized` if you have either a simple authorization scheme (e.g. is the current route allowed?) or some specific authorization scheme application-wide. This method also abstracts away the caching of permissions and type-checking for a returned promise.

A simple example:
```
// for a permissions object returned like {canView: [23, 24, 25], canEdit: ...}
angular.module('exampleApp').controller('ExampleCtrl', function ($scope, $route, intcSecurity) {
    intcSecurity.isAuthorized('canView/23');
});
```

The method prioritizes authorization as follows:

1. check for custom route authorization; this is a function assigned to a route like:
```
.when('/some/:someField/an-action', {
    ...
    resolve: ...,
    customAuthorization: function(query, permissions, route, routeParams){ ... },
})
```

2. check for global custom authorization; this is a function defined like:
```
tmix-security provider.setCustomAuthorization(function(query, permissions, route, routeParams){
    ...
});
```

3. default authorization; the current route is checked against an array of routes in permissions:
```
// assume we are in '/some-route' the permissions object is ['/', '/some-route', ...]
tmix-security provider.isAuthorized() === true;
```

4. xpath-like search through the permissions object
```
// assume permissions like {GET: {route: [1, 2, 3]}}
tmix-security provider.isAuthorized('GET/route/1') === true;
tmix-security provider.isAuthorized('GET#route#1', '#') === true;
```

5. pass in a function:
```
tmix-security provider.isAuthorized(function(query, permissions, route, routeParams){
    ...
});
```

### Example: Use Permissions in a Controller

1. Once permissions are set on the route, you can access permissions from within controllers (without a parameter, `getPermissions` will retrieve permissions for the current route, e.g. if the route's permissions field is a string, it will assume it is a URL--if not, it will assume it is a permissions object):
```
angular.module('exampleApp').controller('ExampleCtrl', function ($scope, intcSecurity) {
    var permissions = intcSecurity.getPermissions().then(function(permissions){
        ...
    }); 
});
```

2. If you set a parameter, you can retrieve the permissions from a different route:
```
var permissions = intcSecurity.getPermissions('/some-other-route').then(function(permissions){
    ...
}); 
```

3. If the permissions have already been cached, e.g. in a previous `authorizeOrRedirect()`, just the permissions object will be returned:
```
var permissions = intcSecurity.getPermissions();
```

4. Alternately,


### Example: Use One Set of Permissions Throughout Application

1. In cases where the permissions object is the same throughout the entire application, setup a default permissions object. E.g.:
```
angular.module('exampleApp', [
  'intcNg'
]).config(function($routeProvider, tmix-security provider) { 
    // use a URL...
    tmix-security provider.setDefaultPermissions('http://www.example.com/api/permissions');
    // ... or use a static object
    tmix-security provider.setDefaultPermissions({canEdit: [1, 2, 3]});
```

2. Now you can skip the permissions object when securing routes:
```
        .when('/edit/:id', {
            templateUrl: 'views/module.html',
            controller: 'ModuleCtrl',
            resolve: {auth: ['intcSecurity', function(intcSecurity){ return intcSecurity.authorizeOrRedirect(); }]}
            // no permissions declared here; will use default
        });
```

3. Also, you can call `getPermissions()` without a route from within the controller:
```
angular.module('exampleApp').controller('ExampleCtrl', function ($scope, intcSecurity) {
    var permissions = intcSecurity.getPermissions().then(function(permissions){ // notice no route is needed when default permissions are set
        ...
    }); 
});
```

### Example: Redirect to a Custom URL

By default, tmix-security provider will redirect to `/forbidden` when a user does not have authorization to a route. To change the redirect route, add a `deniedRoute` property on the route in question:
```
        .when('/edit/:id', {
            templateUrl: 'views/module.html',
            controller: 'ModuleCtrl',
            resolve: {auth: ['intcSecurity', function(intcSecurity){ return intcSecurity.authorizeOrRedirect(); }]}
            deniedRoute: '/custom-access-denied-route'
        });
```

### Example: Set Custom, Static Permissions

If `permissions` is an array or object, the SecurityProvider will use this instance as the route's permissions:
```
        .when('/', {
            ...
            resolve: {auth: ['Security', function(Security){ return Security.authorizeOrRedirect(); }]},
            permissions: ['/', '/route1', '/route2']
        })
```

### Note: Things That I Wish Were Different

- the `resolve` property must be added to each route and the object is too long. We tried several shorter versions but they would break on `grunt build`.
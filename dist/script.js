var myApp = angular.module('myApp',['ui.select','angularSpinner', 'ngDialog', 'ngSanitize', 'ngRoute']);

myApp.controller('MainCtrl', ['$rootScope','$scope','$http','usSpinnerService', 'ngDialog', '$sce', '$location', '$routeParams', function($rootScope,$scope,$http,usSpinnerService,ngDialog,$sce,$location,$routeParams) {

    $scope.user = window.user;
    $scope.books = null;
    $scope.contributors = [];
    $scope.selectedShelf = 'to-read';
    $scope.shelves = [];
    $scope.selectedBook = null;
    $scope.doSearch = false;
    $scope.filter = '';
    $scope.isFetching = false;
    $scope.libraries = {};
    $scope.libraryFriendly = false;
    $scope.selectedLibrary = false;
    $scope.loaded = {
        routeParams: false,
        contributors: false
    };
    $scope.serverError = false;
    $scope.firstLoad = true;


    if ($scope.user) {
        $http.get('/fetch/contributors').success(function(data) {
            $scope.loaded.contributors = true;
            if (data.response && data.response.contributor) {
                $scope.contributors = data.response.contributor;
                $scope.attemptFetch();
            }
        });        
    }


    $scope.$on('$routeChangeSuccess', function() {
        if ($scope.firstLoad) {
            $scope.firstLoad = false;
            if (!$scope.user) {
                $location.path("/");
                return;
            }
            if ($routeParams.library) {
                $scope.loaded.routeParams = true;
                $scope.selectedLibrary = $routeParams.library;
                $scope.attemptFetch();
            }
        }
    });

    $scope.attemptFetch = function() {
        if ($scope.loaded.contributors && $scope.loaded.routeParams) {
            $scope.fetch();
        }
    };

    $scope.reset = function() {
        $scope.libraries = {};
        $scope.selectedLibrary = null;
        $scope.doSearch = null;
        $scope.filter = '';
        $location.path("/");
    };

    $scope.fetch = function() {

        $scope.doSearch = true;
        $scope.isFetching = true;
        $scope.serverError = false;
        $scope.showSpinner();

        $scope.libraryFriendly = $scope.libraries.selected.name;
        $scope.selectedLibrary = $scope.libraries.selected.id;

        // SET HASH
        $location.path("/search/" + $scope.selectedLibrary);

        Intercom('trackEvent',"Performed Search", {
            "Library": $scope.libraries,
            "Shelf": $scope.selectedShelf
        });

        var url = "/fetch/results/" + $scope.selectedLibrary + "/" + $scope.selectedShelf;
        
        $http.get(url)
            .success(function(data) {

                $scope.stopSpinner();

                var predata = data;

                // ratings need to be converted from strings to integers
                angular.forEach(predata, function (book) {
                    book.ratings_count = parseFloat(book.ratings_count);
                });

                $scope.books = predata;
                
            })
            .error(function(data, status, headers, config) {

                Intercom('trackEvent',"Fetch Error - " + status);

                $scope.stopSpinner();
                $scope.serverError = status;

            });

    };

    $scope.showSpinner = function() {
        usSpinnerService.spin('spinner-1');
    };

    $scope.stopSpinner = function() {
        $scope.isFetching = false;
        usSpinnerService.stop('spinner-1');
    };

    $scope.login = function() {
        Intercom('trackEvent',"Login");
        window.location.href = "/auth/goodreads";
    };

    $scope.logout = function() {
        Intercom('trackEvent',"Logout");
        window.location.href = "/logout";
    };

    $scope.openItem = function(book) {

        if ($scope.selectedBook === book) {
            return;
        }

        $scope.selectedBook = book;

        Intercom('trackEvent',"View Book Details", {
            "ISBN": book.isbn,
            "Title": book.title,
            "Author": book.author,
            "Rating": book.rating,
            "Library": $scope.selectedLibrary,
            "Shelf": $scope.selectedShelf
        });
        
        setTimeout(function() {
            ngDialog.open({
                template: "dialog/dialog.html",
                scope: $scope,
                className: 'ngdialog-theme-plain'
            });
        },650);
        
    };

    $scope.stars = function(num) {
        var roundNum = Math.round(num);
        var output = "";
        for (var i = 0; i < roundNum; i++) {
            output += '<i class="fa fa-star"></i>';
        }
        for (var j = 5; j > roundNum; j--) {
            output += '<i class="fa fa-star off"></i>';
        }
        return output;
    };

    $scope.trustedDescription = function() {
        return $sce.trustAsHtml($scope.selectedBook.description);
    };

    $rootScope.$on('ngDialog.closed', function (e, $dialog) {
        $scope.selectedBook = null;
        $scope.$digest();
    });

    Intercom('trackEvent',"Page Loaded");

}]);


myApp.config(function($routeProvider, $locationProvider){
    $locationProvider.html5Mode(true);
    $routeProvider
        .when('/', {
            controller: 'MainCtrl'
        })
        .when("/search/:library", {
            controller: 'MainCtrl'
        })
        .otherwise({redirectTo:'/'});
});

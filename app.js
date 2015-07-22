/*jslint white: true, unparam: true  */


// PACKAGES
var parseString = require('xml2js').parseString;
var async = require('async');
var request = require('request');
var express = require('express');
var passport = require('passport');
var libxmljs = require("libxmljs");
var util = require('util');
var GoodreadsStrategy = require('passport-goodreads').Strategy;
var open = require('open');
var fs = require('fs');
var moment = require('moment');
var colors = require('colors');
var SITE_URL;
var ENV = "local";
var port = process.env.PORT || 3000;

// EXPRESS MIDDLEWARE
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var morgan = require('morgan');
var methodOverride = require('method-override');

// IF 'PROD' IS PASSED IN AS AN ARG SET ENVIRONMENT
process.argv.forEach(function(val, index, array) {
  if (val === "prod" || val === "production") {
    ENV = "prod";
  }
});

// CONFIG
var config = require("./config/config.js");
var credentials = {};
if (ENV === "local") {
  credentials = require("./config/credentials.js");
} else {
  credentials["trove-secret"] = process.env.TROVE_SECRET;
  credentials["goodreads-key"] = process.env.GOODREADS_KEY;
  credentials["goodreads-secret"] = process.env.GOODREADS_SECRET;
}

var contributorFile = "lib/contributors.json";

var bookTmpl = {
  isbn: null,
  isbn13: null,
  author: null,
  title: null,
  image: null,
  rating: null,
  ratingsCount: null,
  description: null,
  published: null,
  url: null,
  holdings: [],
  troveUrl: null
};

var details = [];

// SET OAUTH CALLBACK URL
SITE_URL = config[ENV + "-url"];

// LOGGER
var log = (function() {
  return {
    info: function(str) {
      var msg = "info: ".bold + str;
      msg = msg.blue;
      console.log(msg);
    },
    warn: function(str) {
      var msg = "info: ".bold + str;
      msg = msg.orange;
      console.log(msg);
    },
    empty: function() {
      console.log("");
    }
  };
}());

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Goodreads profile is
//   serialized and deserialized.
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});


// Use the GoodreadsStrategy within Passport.
//   Strategies in passport require a `verify` function, which accept
//   credentials (in this case, a token, tokenSecret, and Goodreads profile), and
//   invoke a callback with a user object.
passport.use(new GoodreadsStrategy({
    consumerKey: credentials["goodreads-key"],
    consumerSecret: credentials["goodreads-secret"],
    callbackURL: SITE_URL + "/auth/goodreads/callback"
  },
  function(token, tokenSecret, profile, done) {
    // asynchronous verification, for effect...
    process.nextTick(function() {

      // To keep the example simple, the user's Goodreads profile is returned to
      // represent the logged-in user.  In a typical application, you would want
      // to associate the Goodreads account with a user record in your database,
      // and return that user instead.
      return done(null, profile);
    });
  }
));




var app = express();

// configure Express
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(cookieParser());
app.use(bodyParser.json());
app.use(methodOverride());
app.use(session({
  secret: 'keyboard cat',
  saveUninitialized: true,
  resave: true
}));

// Initialize Passport!  Also use passport.session() middleware, to support
// persistent login sessions (recommended).
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname + '/dist'));


app.get('/', function(req, res){
  res.render('master', { user: req.user });
});

app.get('/search/:id', function(req, res){
  res.render('master', { user: req.user });
});



app.get('/fetch/shelves', function(req, res){
  if (!req.user) {
    res.send([]);
    return;
  }
  request.get({
    url: "https://www.goodreads.com/shelf/list.xml",
    qs: {
      "key": credentials["goodreads-key"],
      "user": req.user.id
    }
  }, function(e,r,body) {
    var response = [];
    parseString(body, function(err, result) {
      var shelves = result.GoodreadsResponse.shelves[0].user_shelf;
      for (var i = 0, len = shelves.length; i < len; i++) {
        var item = {
          id: shelves[i].id[0]["_"],
          name: shelves[i].name[0]
        };
        response.push(item);
      }
    });
    res.send(response);
  });
});



app.get("/fetch/results/:nucs/:shelf", function(req, res) {
  if (!req.user) {
    res.redirect("/");
  }
  if (!req.params.nucs || !req.params.shelf) {
    res.send(401);
    return;
  }
  var nucsAsString = req.params.nucs;
  var nucs = [];
  if (nucsAsString.indexOf(",") >= 0) {
    nucs = nucsAsString.split(",");
  } else {
    nucs = [nucsAsString];
  }

  request.get({
    url: "https://www.goodreads.com/review/list/" + req.user.id + ".xml",
    qs: {
      "key": credentials["goodreads-key"],
      "shelf": req.params.shelf,
      "v": 2,
      "per_page": 99 // work around rate limit of 100
    }
  }, function(e,r,body) {
    parseShelfResult(req,res,body,nucs);
  });
});

// GET /auth/goodreads
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Goodreads authentication will involve redirecting
//   the user to goodreads.com.  After authorization, Goodreads will redirect the user
//   back to this application at /auth/goodreads/callback
app.get('/auth/goodreads',
  passport.authenticate('goodreads'),
  function(req, res){
    // The request will be redirected to Goodreads for authentication, so this
    // function will not be called.
  });

// GET /auth/goodreads/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/goodreads/callback',
  passport.authenticate('goodreads', { failureRedirect: '/' }),
  function(req, res) {

    request.get({
      url: "https://www.goodreads.com/user/show/" + req.user.id + ".xml",
      qs: {
        "key": credentials["goodreads-key"]
      }
    }, function(e,r,body) {
      if (!e) {
        handleDisplayPicture(body,req,res);
      } else {
        res.redirect('/');
      }
    });

  });

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

app.get('/fetch/contributors', function(req,res) {

  if (!req.user) {
    res.send([]);
    return;
  }

  async.parallel([function(callback,results) {
    checkContributorCache(callback,results);
  }], function(err,results) {

    contributors = results[0];

    if (contributors && contributors.length) {
      log.info("read from cache instead");
      res.send(contributors);
    } else {
      log.warn("no cache, fetch anew");
      var url = 'http://api.trove.nla.gov.au/contributor?encoding=json&key={key}';
      url = url.replace("{key}",credentials["trove-secret"]);
      request.get({
        url: url
      }, function(e,r,body) {
        res.send(body);
        writeToCache(body);
      });
    }

  });


});

var handleDisplayPicture = function(requestBody,req,res) {

  req.user.image_url = "";

  parseString(requestBody, function(err, result) {

    if (result.GoodreadsResponse &&
        result.GoodreadsResponse.user &&
        result.GoodreadsResponse.user[0].image_url[0]) {

      req.user.image_url = result.GoodreadsResponse.user[0].image_url[0];

    }

    res.redirect('/');

  });
};

var checkContributorCache = function(callback,results) {

  fs.readFile(contributorFile, "utf8", function(error, data) {
    if (!error) {
      var cachedContributors = JSON.parse(data);

      // if the file has been propagated and a date exists
      if (cachedContributors.updated) {

        // cache period vs. yesterday
        var updated = moment(cachedContributors.updated).valueOf();
        var yesterday = moment().subtract(1,'day').valueOf();

        // if within cache period
        if (updated > yesterday) {
          // and if there's actually some data
          if (cachedContributors.contributors) {
            log.info("cache hit!");
            // results.push(cachedContributors.contributors);
            callback(null,cachedContributors.contributors);
            return;
          }
          log.warn("couldn't read cache");
          callback();
          return;
        }
        log.warn("cache too old");
        callback();
        return;
      }
      log.warn("couldn't read date stamp");
      callback();
      return;
    } else {
      callback();
      return;
    }
  });

};

var fetchContributors = function() {
    var url = 'http://api.trove.nla.gov.au/contributor?encoding=json&key={key}';
    url = url.replace("{key}",credentials["trove-secret"]);
    request.get({
      url: url
    }, function(e,r,body) {
      res.send(body);
      writeToCache(body);
    });
};

var writeToCache = function(contributors) {
  var toWrite = {
    updated: +new Date(),
    contributors: contributors
  }
  fs.writeFile(contributorFile, JSON.stringify(toWrite), function(err) {
    if (err) {
      console.error(err);
    } else {
      log.info("wrote to cache");
    }
  });
};

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/');
}

var parseShelfResult = function(req,res,body,nucs) {
  var usersBooks = [];
  parseString(body, function(err, result) {
    var reviews = result.GoodreadsResponse.reviews["0"].review;
    for (var prop in reviews) {
      var book = reviews[prop].book["0"];
      // ignore books that don't have an ISBN
      if (book && typeof book.isbn[0] === "string") {
        var newBook = JSON.parse(JSON.stringify(bookTmpl));
        newBook.title = book.title.toString();
        newBook.isbn = book.isbn.toString();
        newBook.author = book.authors[0].author[0].name.toString();
        newBook.image = book.image_url.toString();
        newBook.rating = book.average_rating.toString();
        newBook.ratings_count = book.ratings_count.toString();
        newBook.description = book.description.toString();
        newBook.published = book.published.toString();
        newBook.url = book.link;
        usersBooks.push(newBook);
      }
    }
    if (usersBooks.length === 0) {
      res.send("no books in shelf");
      return;
    }
    hitTrove(usersBooks,req,res,nucs);
  });
};


// TROVE RETURNS ALL THE HOLDINGS FOR THE BOOK, SO WE MUST LOOP
// THROUGH ALL THE HOLDINGS AND ENSURE THEY MATCH THE LIBRARY
var matchHoldingsToLibrary = function(item,nucs,holdings) {
  for (var i = 0, len = holdings.length; i < len; i++) {
    for (var j = 0, nucLength = nucs.length; j < nucLength; j++) {
      if (holdings[i].nuc === nucs[j]) {
        item.holdings.push(holdings[i]);
      }
    }
  }
};

var parseTroveResponse = function(item,data,nucs) {

    // Handle any errors
    if (!data || data.charAt(0) === "<") {
      if (data && data.indexOf("requests per minute")) {
        return 429;
      } else {
        return 500;
      }
    }

    var cleanedResponse = JSON.parse(data);

    if (cleanedResponse.response &&
        cleanedResponse.response.zone &&
        cleanedResponse.response.zone[0].records &&
        cleanedResponse.response.zone[0].records.work) {

      var response = cleanedResponse.response.zone[0].records.work[0];

      item.troveUrl = response.troveUrl || "";

      if (response.holding) {
        matchHoldingsToLibrary(item,nucs,response.holding);
      }

      return 200;

    }
};

var buildIsbnSearchSting = function(arr) {
  if (arr.length === 1) {
    return arr[0].isbn;
  } else {
    var isbnList = "";
    for (var i = 0; i < arr.length; i++) {
      if (i === 0) {
        isbnList += arr[i].isbn;
      } else {
        isbnList += " OR " + arr[i].isbn;
      }
    }
    return "(" + isbnList + ")";
  }
};

var hitTrove = function(usersBooks,req,res,nucs) {

  async.each(usersBooks,function(item,cb) {

      var url = "http://api.trove.nla.gov.au/result?key={key}&zone=book&q=isbn:{isbn} AND nuc:{nuc}&include=holdings&encoding=json";
      url = url.replace("{isbn}",item.isbn);
      url = url.replace("{nuc}",nucs.join(","));
      url = url.replace("{key}",credentials["trove-secret"]);

      request.get({
        url: url
      }, function(e,r,data) {
        var troveResponse = parseTroveResponse(item,data,nucs);
        if (troveResponse === 200) {
          cb();
        } else {
          cb(troveResponse);
        }
      });

  }, function(err) {
      if (err) {
        res.sendStatus(err);
      } else {
        removeEmptyHoldings(usersBooks);
        res.send(usersBooks);
      }
  });

  // var isbnsToSearch = buildIsbnSearchSting(usersBooks);

  // var url = "http://api.trove.nla.gov.au/result?key={key}&zone=book&q=isbn:{isbn} AND nuc:{nuc}&include=holdings&encoding=json";
  // url = url.replace("{isbn}",isbnsToSearch);
  // url = url.replace("{nuc}",nucs.join(","));
  // url = url.replace("{key}",credentials["trove-secret"]);

  // TODO: Need to re-add batching
  // request.get({
  //   url: url
  // }, function(e,r,data) {
  //   var troveResponse = parseTroveResponse(usersBooks,data,nucs);
  //   if (troveResponse.status === 200) {
  //     removeEmptyHoldings(usersBooks);
  //     res.send(usersBooks);
  //   } else {
  //     res.sendStatus(troveResponse.status);
  //   }
  // });

};


// LOOP THROUGH THE RESULTS AND REMOVE ANY BOOKS WITH
// NO LISTINGS, LOOPING BACKWARDS AS TO AVOID ARRAY ISSUES
var removeEmptyHoldings = function(usersBooks) {
  for (var i = usersBooks.length - 1; i >= 0; i--) {
    if (usersBooks[i].holdings.length === 0) {
      usersBooks.splice(i,1);
    }
  };
}

app.listen(port);

if (ENV === "local") {
  open(SITE_URL);
}
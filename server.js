var express = require('express');
var serveStatic = require('serve-static');
var Twit = require('twit');
var rest = require('restler');
var Datastore = require('nedb');
var q = require('q');
var d3 = require('d3');
var csv = require('fast-csv');

var app = express();

app.use(serveStatic('public', {'index': ['index.html', 'index.htm']}));

// We need to include our configuration file
var T = new Twit(require('./twitterConfig.js'));
var particleConfig = require('./particleConfig.js');

var requestQueue_db = new Datastore({filename: './requestQueue.db', autoload:true});
var playedSongs_db = new Datastore({filename: './playedSongs.db', autoload:true});

 var displayMentionDays = 5;
 var dbCleanupDays = 3;

//how many times it will try to send everything to the particle before giving up
 var particleErrorThreshhold = 3;

function queueTweets() {
	console.log("look for tweets...");
	var now = new Date(); 
	//get the 50 latest mentions
	T.get('statuses/mentions_timeline', {count:50}, function (error, data) {
		if (data !== undefined){
			for (var i = 0; i < data.length; i++) {
			var dataOfInterest = data[i];
			//only look for tweets less than 24 hours old
			var tweetDate = new Date(dataOfInterest.created_at);
			if(now - tweetDate < (1000*60*60*24 * displayMentionDays)){
				//check that the tweet has not yet been displayed
				//we send all the data to it because the loop will keep running and we want to keep the data attached to the promise
				var isDisplayedPromise = isAlreadyDisplayed(dataOfInterest);
				isDisplayedPromise.done(function(result){
					if(result.toQueue){//tweet not found! queue it up!
						var songData = processTweetData(result.data);	
						if (songData !== undefined) {
							requestQueue_db.insert(songData);
							console.log("queueing ", songData);
						}				
					}
				});
			}
		};
	}	
	});

	//get usages of the #jukeboxBackpack hashtag
	T.get('search/tweets', { q: '#jukeboxBackpack', result_type: 'recent', count: 50}, function(error, data){
		if (data.statuses !== null){
			for (var i = 0; i < data.statuses.length; i++) {
				var dataOfInterest = data.statuses[i];
				
				//only queue up not retweets
				if (dataOfInterest.retweeted_status == undefined){
					var isDisplayedPromise = isAlreadyDisplayed(dataOfInterest);

					isDisplayedPromise.done(function(result){
						if(result.toQueue){//tweet not found! queue it up!
							var songData = processTweetData(result.data);
							if (songData !== undefined) {
								requestQueue_db.insert(songData);
								console.log("queueing ", songData);
							}
						}
					});
				}
			};
		}
	});
}

function processTweetData(tweetData){
	//var fileStream = fs.createReadStream("../data/songs.csv"),
    //parser = fastCsv();

	csv
	 .fromPath("../data/songs.csv")
	 .on("data", function(data){
	     console.log(data);
	 })
	 .on("end", function(){
	     console.log("done");
	 });

	/*csv.parse('../data/songs.csv', function(songs){
		var tweetMessage = Number((tweetData.text).substring(tweetData.in_reply_to_screen_name.length+2).trim());

		if (tweetMessage !== NaN){
			return undefined;
		}

		for (var i = 0; i < songs.length; i++) {
			if (Number(songs[i].songNum) === tweetMessage){
				var queueTweet = {
					"id" : tweetData.id,
					created_at: new Date(tweetData.created_at),
					message : tweetMessage
				};

				return queueTweet;
			}
		};
		
	});*/

	
}

function isTweetQueued(tweetData){
	var deferred = q.defer();
	requestQueue_db.loadDatabase();
	requestQueue_db.findOne({id : tweetData.id}, function (err, doc) {
		if (err){ //if theres an error, just let it check next time
			deferred.resolve(true);
		}
		else if (doc === null){ //if nothing was found, return false
			deferred.resolve(false);
		}
		else { // otherwise return true
			deferred.resolve(true);
		}
	});
	
	return deferred.promise;
}

function isAlreadyDisplayed(tweetData){
	var deferred = q.defer();

	var isTweetQueuedPromise = isTweetQueued(tweetData);
	isTweetQueuedPromise.done(function(isTweetQueuedRes){
		if(isTweetQueuedRes){
			deferred.resolve({toQueue: false, data:tweetData});
		}
		else{
			playedSongs_db.loadDatabase();
			playedSongs_db.findOne({id : tweetData.id}, function (err, doc) {
				if (err){ //if theres an error, just let it check next time
					deferred.resolve({toQueue: false, data:tweetData});
				}
				else if (doc === null){ //value not found, queue up
					deferred.resolve({toQueue: true, data:tweetData});
				}
				else { //value found, do not queue it up
					deferred.resolve({toQueue: false, data:tweetData});
				}
			});
		}
	});

	return deferred.promise;
}

 function getLeastRecentTweet(){
 	var deferred = q.defer();

 	requestQueue_db.findOne({}).sort({ created_at: 1 }).exec(function (err, doc) {
  		deferred.resolve(doc);
	});

 	return deferred.promise;
 }

 function incrementErrorCount(tweet){
 	requestQueue_db.update({ id: tweet.id }, { $inc: {errorCount: 1}});
 }

 function playSong(){
 	console.log("playing song");

	requestQueue_db.loadDatabase();
 	requestQueue_db.count({}, function (err, count) {
 		console.log("request count is " + count);

	  if (count > 0){
		getLeastRecentTweet().done(function(tweetOfInterest){
			console.log("tweet of interest found");

			sendMessage(tweetOfInterest.message).done(function(data, response){
				console.log("data", data);

				if (data.ok !==undefined && !data.ok){
					incrementErrorCount(tweetOfInterest);
				}

				if (data.ok === undefined){
					console.log("response is fine");
					if (data.return_value == -1){
						//do nothing, not ready for playing
						console.log("Not waiting for music");
					}
					else {

						console.log("Successfully sent!", tweetOfInterest.message);

						playedSongs_db.insert({id: tweetOfInterest.id, displayed_at: new Date(), displayed: true, errored: false, message: tweetOfInterest.message});
						requestQueue_db.remove({id: tweetOfInterest.id}, {multi: true});
					}
				}

				//too many errors, send to displayed
				if (tweetOfInterest.errorCount && tweetOfInterest.errorCount >= (particleErrorThreshhold-1)){
					playedSongs_db.insert({id: tweetOfInterest.id, message: "Error: " +  tweetOfInterest.message, displayed_at: new Date(), displayed: false, errored: true});
					requestQueue_db.remove({id: tweetOfInterest.id}, {multi: true});
				}
			});
		});
	  }

	});
}

function sendMessage(message){
	var deferred = q.defer();
	rest.post('https://api.spark.io/v1/devices/' + particleConfig.deviceID + '/sendSong', {
		data: { 'access_token': particleConfig.accessToken,
		'args': message }
	}).on('complete', function(data, response) {
		deferred.resolve(data,response);
	});

	return deferred.promise;
}

 queueTweets(); 
 
 setInterval(queueTweets, 1000 * 60);
 setInterval(playSong, 1000 * 30);

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('Jukebox server running at http://%s:%s', host, port);
});
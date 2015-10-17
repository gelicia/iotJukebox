var express = require('express');
var serveStatic = require('serve-static');
var Twit = require('twit');

var app = express();

app.use(serveStatic('public', {'index': ['index.html', 'index.htm']}));

var T = new Twit(require('./twitterConfig.js'));

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
						var queueTweet = processTweetData(result.data);					
						tweetQueue_db.insert(queueTweet);
						console.log("queueing ", queueTweet.message);
					}
				});
			}
		};
	}	
	});

	//get usages of the #tweetSkirt hashtag
	T.get('search/tweets', { q: '#jukeboxBackpack', result_type: 'recent', count: 50}, function(error, data){
		if (data.statuses !== null){
			for (var i = 0; i < data.statuses.length; i++) {
				var dataOfInterest = data.statuses[i];
				
				//only queue up not retweets
				if (dataOfInterest.retweeted_status == undefined){
					var isDisplayedPromise = isAlreadyDisplayed(dataOfInterest);

					isDisplayedPromise.done(function(result){
						if(result.toQueue){//tweet not found! queue it up!
							var queueTweet = processTweetData(result.data);
							tweetQueue_db.insert(queueTweet);
							console.log("queueing ", queueTweet.message);
						}
					});
				}
			};
		}
	});
}

var server = app.listen(3000, function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('Jukebox server running at http://%s:%s', host, port);
});
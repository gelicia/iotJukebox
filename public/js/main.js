function loadData(){
	console.log("hello");
	d3.csv('../data/songs.csv', function(d){
		var tableBody = d3.select("#song-list > tbody");


//  var crashes = g.selectAll("circle").data(nestData).enter().append("circle")

		var row = tableBody.selectAll("tr").data(d).enter().append("tr");

		row.append("th").text(function(d){return d.songNum});
		row.append("th").text(function(d){return d.artist});
		row.append("th").text(function(d){return d.title});
		row.append("th").text(function(d){return d.album});

	});
}
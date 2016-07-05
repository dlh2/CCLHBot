var Db = require('./db');
var emoji = require('node-emoji').emoji;
//////////HELPERS//////////
function inArray(array, key, value){
	existe = false;
	for (i = 0; i<array.length && !existe; i++){
		if (array[i][key] === value) existe = true;
	}
	return existe;
}
function getRandomID(from_n, to_n){
	return Math.round(Math.random()*(to_n-from_n)+parseInt(from_n)).toString(36);
}
function shuffleArray(array){
    for(var j, x, i = array.length; i; j = Math.floor(Math.random() * i), x = array[--i], array[i] = array[j], array[j] = x);
    return array;
};
//////////CREATE CLASS//////////
var method = Game.prototype;
//////////CONSTRUCTOR//////////
function Game(bot, url, callback) {
    this.bot = bot;
	this.emoji = emoji;
	this.db = new Db(this.sendMessage, url, callback);
}
//////////METHODS//////////
method.getUsername = function(msg){
	var name = msg.from.first_name;
	if(typeof msg.from.last_name != "undefined") name += " "+msg.from.last_name;
	if(typeof msg.from.username != "undefined") name += " (@"+msg.from.username+")";
	return name
}
method.sendMessage = function(room_id, msg, opts) {
	if (typeof opts == "undefined") this.bot.sendMessage(room_id, msg);
	else this.bot.sendMessage(room_id, msg, opts);
}

/////GAME/////
method.deleteGameData = function (game_id, room_id, callback) {
	var g_object = this;
	g_object.db.remove('games', {game_id: game_id}, room_id, function (){
		g_object.db.remove('players', {game_id: game_id}, room_id, function (){
			g_object.db.remove('wcardsxgame', {game_id: game_id}, room_id, function (){});
			g_object.db.remove('bcardsxgame', {game_id: game_id}, room_id, function (){});
			g_object.db.remove('cardsxround', {game_id: game_id}, room_id, function (){});
			callback();
		});
	});
};
method.getUniqueKey = function(msg, from_n, to_n, callback) {
	var g_object = this;
	g_object.db.find('games', msg, {}, function (r_game) {
		var key = "";
		do {
			key = getRandomID(from_n, to_n);
		} while (inArray(r_game, 'game_id', key));
		callback(key);
	});
};
method.roundWinner = function (r_winner, r_game, r_players, room_id) {
	var g_object = this;
	if (r_winner.points+1 == r_game[0].n_cardstowin){
		setTimeout(function(){g_object.sendMessage(r_winner.user_id, g_object.emoji.confetti_ball+" Has ganado la partida!! "+g_object.emoji.confetti_ball);}, 300);
		setTimeout(function(){g_object.sendMessage(r_game[0].room_id, r_winner.username+" ha ganado la partida!! "+g_object.emoji.confetti_ball+" "+g_object.emoji.confetti_ball);}, 300);
		//Borramos la partida
		g_object.deleteGameData(r_game[0].game_id, room_id, function (){});
	} else if (r_winner.points+1 < r_game[0].n_cardstowin) {
		g_object.db.update('players', {user_id: r_winner.user_id}, {"points": (parseInt(r_winner.points)+1)}, room_id,  function () {
			g_object.db.remove('cardsxround', {game_id: r_game[0].game_id}, room_id, function (){
				if (r_game[0].type=="dictadura"){
					setTimeout(function() {g_object.nextRound(r_game[0], r_players, room_id);}, 300);
				} else if (r_game[0].type=="clasico"){
					var dictador = 0;
					if (parseInt(r_game[0].dictator_id)+1 <= r_game[0].n_players) dictador = parseInt(r_game[0].dictator_id)+1;
					else dictador = 1;
					g_object.db.update('games', {game_id: r_game[0].game_id},  {"dictator_id": dictador}, room_id, function () {
						r_game[0].dictator_id = dictador;
						setTimeout(function() {g_object.nextRound(r_game[0], r_players, room_id);}, 300);
					});
				} else if (r_game[0].type=="democracia"){
					setTimeout(function() {g_object.nextRound(r_game[0], r_players, room_id);}, 300);
				} else g_object.sendMessage(r_game[0].room_id, "Error inesperado en el tipo.");
			});
		});
	} else g_object.sendMessage(r_game[0].room_id, "Error inesperado.");
}
method.nextRound = function (r_game, r_players, room_id) {
	var g_object = this;
	g_object.db.update('games', {game_id: r_game.game_id}, {"currentblack": (parseInt(r_game.currentblack)+1) }, room_id, function () {
		g_object.db.limitFind('bcardsxgame', {cxg_id: (parseInt(r_game.currentblack)+1), game_id: r_game.game_id}, 1, room_id, function (bcard){
			if (bcard.length){
				g_object.sendMessage(room_id, "La carta negra de esta ronda es: \n"+bcard[0].card_text);
				var except_id = 0;
				var except_username = 0;
				if (r_game.type=="dictadura"){
					except_id = r_game.creator_id; 
					except_username = r_game.creator_name;
				} else if (r_game.type=="clasico"){
					g_object.db.find('players', {player_id: r_game.dictator_id, game_id:r_game.game_id}, room_id, function(dictator){
						if (dictator.length){
							except_id = dictator[0].user_id;
							except_name = dictator[0].username;
						} else g_object.sendMessage(room_id, "Error inesperado en modo clasico.");
					});
				}
				for (i = 0; i < r_players.length; i++){
					(function(i) {
						g_object.db.limitFind('wcardsxgame', {player_id: r_players[i].player_id, game_id: r_game.game_id}, 5, room_id, function (wcard){
							var buttonarray = [];
							var cardstext = "";
							for (j = 0; j < wcard.length;j++){
								buttonarray.push(["/"+wcard[j].cxpxg_id+" "+wcard[j].card_text]);
								cardstext += (j+1)+". "+wcard[j].card_text+"\n";
							}
							var opts = {
								reply_markup: JSON.stringify({
									keyboard: buttonarray,
									one_time_keyboard: true
								})
							};
							if (r_game.type=="clasico") g_object.sendMessage(r_players[i].user_id, "El lider de esta ronda es: "+except_name);
							if (r_players[i].user_id != except_id) g_object.sendMessage(r_players[i].user_id, bcard[0].card_text+"\nElige una opcion:\n "+cardstext, opts);
						});
					})(i);
				}
			} else g_object.sendMessage(room_id, "Error inesperado.");
		});
	});
};
method.createGame = function(data, room_id, callback){
	var g_object = this;
	g_object.db.insert('games', data, room_id, function (err, result) {
		g_object.db.find('whitecards', {dictionary: data.dictionary}, room_id, function (array){
			array = shuffleArray(array).slice(0, data.n_players*45);
			g_object.db.sortFind('wcardsxgame', {}, {"_id": -1}, 1, room_id, function (lastcard){
				if (!lastcard.length) id = 1;
				else id = lastcard[0]._id+1;
				for (i = 0, j = 0; i < array.length; i++, j++){
					if (j == 45) j = 0;
					array[i]._id = id + i; 
					array[i].game_id = data.game_id;
					array[i].cxpxg_id = j;
					array[i].player_id = Math.round(i/45)+1;
				}
				g_object.db.insertMany('wcardsxgame', array, room_id);
			});
		});
		g_object.db.find('blackcards', {dictionary: data.dictionary}, room_id, function (array){
			array = shuffleArray(array).slice(0, data.n_players*45);
			g_object.db.sortFind('bcardsxgame', {}, {"_id": -1}, 1, room_id, function (lastcard){
				if (!lastcard.length) id = 1;
				else id = lastcard[0]._id+1;
				for (i = 0, j = 0; i < array.length; i++, j++){
					if (j == 45) j = 0;
					array[i]._id = id + i;
					array[i].game_id = data.game_id;
					array[i].cxg_id = j;
				}
				g_object.db.insertMany('bcardsxgame', array, room_id);
			});
		});
		callback();
	});
};

//Export the game
module.exports = Game;
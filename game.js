//ToDo: Al consultar la BD usar el callback de 2 parametros (err, response) para propagar errores y usar el metodo del return; para capturarlos
//ToDo: Donde entra por parametro r_game hay que limitar la informacion que recibe a solo la que va a usar
var Db = require('./db');
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
function Game(url, callback) {
	this.db = new Db(url, callback);
}
//////////METHODS//////////
method.getUsername = function(msg){
	var name = msg.from.first_name;
	if(typeof msg.from.last_name != "undefined") name += " "+msg.from.last_name;
	if(typeof msg.from.username != "undefined") name += " (@"+msg.from.username+")";
	return name
}

//////////GAME//////////

//getUniqueKey: start_number, end_number, callback
method.getUniqueKey = function(from_n, to_n, callback) {
	var g_object = this;
	g_object.db.find('games', {}, function (r_game) {
		var key = "";
		do {
			key = getRandomID(from_n, to_n);
		} while (inArray(r_game, 'game_id', key));
		callback(key);
	});
};

//createGame: data {from_id, type, n_players, n_cardstowin, dictionary}, callback
method.createGame = function(data, callback){
	var g_object = this;
	//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
	g_object.db.count('games', {room_id: data.room_id}, function(count_games) {
		//Si hay partida en este grupo
		if (count_games) {
			callback({status: "ERR", msg: "ERR_ACTIVE_GAME"});
			return 
		}
		//Comprobamos que el usuario no este en ninguna otra partida
		g_object.db.count('players', {user_id: data.from_id}, function(count_players){
			//Si no esta en ninguna partida
			if (count_players){
				callback({status: "ERR", msg: "ERR_ALREADY_IN_GAME"});
				return; 
			}
			//Obtenemos una ID unica para la partida
			g_object.getUniqueKey(10000,99000, function(game_id) {
				//Creamos la partida
				dictionary = "";
				if (typeof data.dictionary == "string" && data.dictionary != "") dictionary = data.dictionary;
				else dictionary = "clasico";
				g_object.db.count('dictionaries', {name: dictionary, valid:1}, function(count_cards) {
					if (!count_cards) dictionary = "clasico";
					var gameinfo = {
						game_id: game_id, 
						room_id: data.room_id, 
						creator_id: data.from_id, 
						creator_name: data.from_name, 
						dictator_id: 1, 
						type: data.type, 
						n_players: data.n_players, 
						n_cardstowin: data.n_cardstowin, 
						currentblack: 0, 
						dictionary: dictionary
					};
					g_object.db.insert('games', gameinfo, function (err, result) {
						g_object.db.find('whitecards', {dictionary: gameinfo.dictionary}, function (array){
							array = shuffleArray(array).slice(0, gameinfo.n_players*45);
							g_object.db.sortFind('wcardsxgame', {}, {"_id": -1}, 1, function (lastcard){
								if (!lastcard.length) id = 1;
								else id = lastcard[0]._id+1;
								for (i = 0, j = 0; i < array.length; i++, j++){
									if (j == 45) j = 0;
									array[i]._id = id + i; 
									array[i].game_id = gameinfo.game_id;
									array[i].cxpxg_id = j;
									array[i].player_id = Math.round(i/45)+1;
								}
								g_object.db.insertMany('wcardsxgame', array);
							});
						});
						g_object.db.find('blackcards', {dictionary: gameinfo.dictionary}, function (array){
							array = shuffleArray(array).slice(0, gameinfo.n_players*45);
							g_object.db.sortFind('bcardsxgame', {}, {"_id": -1}, 1, function (lastcard){
								if (!lastcard.length) id = 1;
								else id = lastcard[0]._id+1;
								for (i = 0, j = 0; i < array.length; i++, j++){
									if (j == 45) j = 0;
									array[i]._id = id + i;
									array[i].game_id = gameinfo.game_id;
									array[i].cxg_id = j;
								}
								g_object.db.insertMany('bcardsxgame', array);
							});
						});
						if (count_cards) dictionary_status = "DICTIONARY_OK";
						else dictionary_status = "DICTIONARY_FAILED";
						//ToDo: mejorar esto para no usar setTimeout
						setTimeout(function(){callback({status: "OK", data: {game_id: game_id, dictionary_status: dictionary_status, dictionary: dictionary}});}, 300);
					});
					
				});
			});
		});
	});
};

//joinGame: data {data.game_id, data.user_id, data.username}, callback
method.joinGame = function(data, callback){
	var g_object = this;
	//Comprueba que el grupo tenga una partida creada.
	g_object.db.find('games', {game_id: data.game_id}, function(r_game) {
		//En el caso de que no tenga una partida creada
		if (!r_game.length) {
			callback({status: "ERR", msg: "ERR_UNKNOWN_GAME"});
			return;
		}
		//Comprobamos que la partida no esté iniciada
		if (parseInt(r_game[0].currentblack)){
			callback({status: "ERR", msg: "ERR_ALREADY_STARTED"});
			return;
		}
		g_object.db.count('players', {game_id: r_game[0].game_id}, function(count_players){
			//Comprobamos que la sala no este llena
			if (count_players >= r_game[0].n_players){
				callback({status: "ERR", msg: "ERR_ALREADY_FILLED"});
				return;
			}
			g_object.db.count('players', {user_id: data.user_id}, function(player){
				//Comprobamos que el player no se haya unido ya
				if (player){
					callback({status: "ERR", msg: "ERR_ALREADY_IN_GAME"});
					return;
				}
				g_object.db.insert('players', {
					player_id: count_players+1, 
					game_id: r_game[0].game_id, 
					user_id: data.user_id, 
					username: data.username, 
					points: 0, vote_delete: 0
				}, function(){
					callback({status: "OK", data: {room_id: r_game[0].room_id}});
				});
			});
		});
	});
};

//startGame: user_id, room_id, callback
method.startGame = function (user_id, room_id, callback){
	var g_object = this;
	//Comprueba que el grupo tenga una partida creada.
	g_object.db.find('games', {room_id: room_id}, function(r_game) {
		//En el caso de que no tenga una partida creada
		if (!r_game.length) {
			callback({status: "ERR", msg: "ERR_NO_ACTIVE_GAMES"});
			return;
		}
		//En el caso de que tenga una partida comprueba que el usuario que la borra es el mismo que la creo.
		if (r_game[0].creator_id != user_id){
			callback({status: "ERR", msg: "ERR_NOT_CREATOR_START", extra: {creator_name: r_game[0].creator_name}});
			return;
		}
		//Comprobamos
		if (parseInt(r_game[0].currentblack) != 0){
			callback({status: "ERR", msg: "ERR_ALREADY_STARTED"});
			return;
		}
		g_object.db.find('players', {game_id: r_game[0].game_id}, function(r_players){
			//Comprobamos que la partida este llena
			if (r_players.length != r_game[0].n_players){
				callback({status: "ERR", msg: "ERR_NOT_ENOUGHT_PLAYERS", extra: {current_players: r_players.length, max_players: r_game[0].n_players}});
				return;
			}
			callback({status: "OK", data: {game: r_game[0], players: r_players}});
		});
	});
};

//startRound: r_game, r_players, callback
method.startRound = function (r_game, r_players, msg_callback, callback) {
	var g_object = this;
	g_object.db.update('games', {game_id: r_game.game_id}, {"currentblack": (parseInt(r_game.currentblack)+1) }, function () {
		g_object.db.limitFind('bcardsxgame', {cxg_id: (parseInt(r_game.currentblack)+1), game_id: r_game.game_id}, 1, function (bcard){
			if (!bcard.length){
				console.log("bcard");
				callback({status: "ERR", msg: "ERR_UNEXPECTED"});
				return;
			}
			var except_id = 0;
			var except_username = 0;
			if (r_game.type=="dictadura"){
				except_id = r_game.creator_id; 
				except_username = r_game.creator_name;
			} else if (r_game.type=="clasico"){
				g_object.db.find('players', {player_id: r_game.dictator_id, game_id:r_game.game_id}, function(dictator){
					if (!dictator.length){
						console.log("dictator");
						callback({status: "ERR", msg: "ERR_UNEXPECTED"});
						return;
					}
					except_id = dictator[0].user_id;
					except_username = dictator[0].username;
				});
			}
			for (i = 0; i < r_players.length; i++){
				(function(i) {
					g_object.db.limitFind('wcardsxgame', {player_id: r_players[i].player_id, game_id: r_game.game_id}, 5, function (wcard){
						var buttonarray = [];
						var cardstext = "";
						//ToDo: hacer menos dependiente de telegram el array.
						for (j = 0; j < wcard.length;j++){
							buttonarray.push(["/"+wcard[j].cxpxg_id+" "+wcard[j].card_text]);
							cardstext += (j+1)+". "+wcard[j].card_text+"\n";
						}
						if (r_players[i].user_id != except_id) 
							msg_callback(r_players[i].user_id, bcard[0].card_text, buttonarray, cardstext);
					});
				})(i);
			}
			callback({status: "OK", data: {blackcard: bcard[0].card_text, game_type: r_game.type, dictator_id: except_id, dictator_name: except_username}});
		});
	});
};

method.sendCard = function (user_id, card_id, card_text, callback) {
	var g_object = this;
	g_object.db.find('players', {user_id: user_id}, function(r_player){
		if (!r_player.length){
			callback({status: "ERR", msg: "ERR_USER_NO_GAME"});
			return;
		}
		g_object.db.find('games', {game_id: r_player[0].game_id}, function(r_game) {
			if (!r_game.length) {
				callback({status: "ERR", msg: "ERR_GAME_DELETED"});
				return;
			}
			if (!r_game[0].currentblack){
				callback({status: "ERR", msg: "ERR_GAME_NOT_STARTED"});
				return;
			}
			g_object.db.find('cardsxround', {game_id: r_game[0].game_id}, function(n_cards){
				if (n_cards.length >= r_game[0].n_players){
					callback({status: "ERR", msg: "ERR_ALL_ALREADY_RESPONSED"});
					return;
				}
				g_object.db.count('cardsxround', {user_id: user_id}, function(n_player){
					if (n_player){
						callback({status: "ERR", msg: "ERR_USER_ALREADY_RESPONSED"});
						return;
					}
					if ((r_game[0].type=="dictadura" && r_game[0].creator_id == user_id) || (r_game[0].type=="clasico" && r_game[0].dictator_uid == user_id)){
						callback({status: "ERR", msg: "ERR_DICTATOR_NOT_ALLOWED"});
						return;
					}
					g_object.db.insert('cardsxround', {card_id: n_cards.length+1, game_id: r_game[0].game_id, user_id: user_id, card_text:card_text, votes: 0}, function(){
						g_object.db.remove('wcardsxgame', {cxpxg_id: parseInt(card_id), game_id: r_game[0].game_id, player_id: r_player[0].player_id}, function (){
							//Si no eres el ultimo en votar
							if ((r_game[0].type=="dictadura" && n_cards.length+1 < r_game[0].n_players-1) || 
								(r_game[0].type=="clasico" && n_cards.length+1 < r_game[0].n_players-1) || 
								(r_game[0].type=="democracia" && n_cards.length+1 < r_game[0].n_players)){
									callback({status: "OK", data: {status: "NORMAL"}});
								}
							else if ((r_game[0].type=="dictadura" && n_cards.length+1 == r_game[0].n_players-1) || 
								(r_game[0].type=="clasico" && n_cards.length+1 == r_game[0].n_players-1) || 
								(r_game[0].type=="democracia" && n_cards.length+1 == r_game[0].n_players)) //Si eres el ultimo en votar
							{
								//Añadimos la ultima carta al array
								n_cards.push({card_id: n_cards.length+1, game_id: r_game[0].game_id, user_id: user_id, card_text:card_text, votes: 0});
								var textgroup = "";
								var array = [];
								//Creamos el array con los votos
								for (i = 0; i<n_cards.length; i++){
									textgroup += (i+1)+". "+n_cards[i].card_text+"\n";
									array.push(["/vote_"+n_cards[i].card_id+" "+n_cards[i].card_text]);
								}
								g_object.db.limitFind('bcardsxgame', {cxg_id: (parseInt(r_game[0].currentblack)), game_id: r_game[0].game_id}, 1, function (bcard){
									if (!bcard.length){
										callback({status: "ERR", msg: "ERR_UNEXPECTED"});
										console.log("bcard");
										return;
									}
									if (r_game[0].type == "dictadura"){//Dictadura solo vota el lider
										callback({status: "OK", data: {status: "END", card_array: array, card_string: textgroup, game_type: r_game[0].type, room_id: r_game[0].room_id, blackcard: bcard[0].card_text, user_id: r_game[0].creator_id}});
									} else if (r_game[0].type == "clasico") {//Clasico solo vota el lider de esa ronda
										g_object.db.find('players', {player_id: r_game[0].dictator_id, game_id: r_game[0].game_id}, function(dictator){
											callback({status: "OK", data: {status: "END", card_array: array, card_string: textgroup, game_type: r_game[0].type, room_id: r_game[0].room_id, blackcard: bcard[0].card_text, user_id: dictator[0].user_id}});
										});
									} else if (r_game[0].type == "democracia"){//Democracia votan todos
										var user_id = [];
										for (i = 0; i<n_cards.length; i++){
											user_id.push(n_cards[i].user_id);
										}
										callback({status: "OK", data: {status: "END", card_array: array, card_string: textgroup, game_type: r_game[0].type, room_id: r_game[0].room_id, blackcard: bcard[0].card_text, user_id: user_id}});
									} 
								});
							} else callback({status: "ERR", msg: "ERR_UNEXPECTED"});
						});
					});
				});
			});
		});
	});
};

method.sendVote = function (user_id, card_id, callback) {
	var g_object = this;
	g_object.db.find('players', {user_id: user_id}, function(r_player){
		if (!r_player.length){
			callback({status: "ERR", msg: "ERR_USER_NO_GAME"});
			return;
		}
		g_object.db.find('games', {game_id: r_player[0].game_id}, function(r_game) {
			if (!r_game.length) {
				callback({status: "ERR", msg: "ERR_GAME_DELETED"});
				return;
			}
			if (!r_game[0].currentblack){
				callback({status: "ERR", msg: "ERR_GAME_NOT_STARTED"});
				return;
			}
			g_object.db.count('cardsxround', {game_id: r_game[0].game_id}, function(n_cards){
				if (n_cards < r_game[0].n_players-1){
					callback({status: "ERR", msg: "ERR_ALL_NOT_ALREADY_RESPONSED"});
					return;
				}
				g_object.db.find('cardsxround', {card_id: parseInt(card_id), game_id: r_game[0].game_id}, function (r_cards){
					if (!r_cards.length){
						callback({status: "ERR", msg: "ERR_CARD_NOT_FOUND"});
						return;
					}
					g_object.db.find('players', {game_id: r_game[0].game_id}, function(r_players){
						if (!r_players.length){
							callback({status: "ERR", msg: "ERR_UNEXPECTED"});
							console.log("r_players");
							return;
						} 
						g_object.db.find('players', {user_id: r_cards[0].user_id}, function(player){
							if (!player.length){
								callback({status: "ERR", msg: "ERR_UNEXPECTED"});
								console.log("player");
								return;
							}
							if (r_game[0].type=="dictadura"){
								if (r_game[0].creator_id != user_id){
									callback({status: "ERR", msg: "ERR_DICTATOR_NOT_ALLOWED"});
									return;
								}
								callback({status: "OK", data: {game: r_game[0], player: player[0], cards: r_cards[0], players: r_players}});
							} else if (r_game[0].type=="clasico"){
								g_object.db.find('players', {player_id: r_game[0].dictator_id, game_id: r_game[0].game_id}, function(dictator){
									if (dictator[0].user_id != user_id){
										callback({status: "ERR", msg: "ERR_DICTATOR_NOT_ALLOWED"});
										return;
									} 
									callback({status: "OK", data: {game: r_game[0], player: player[0], cards: r_cards[0], players: r_players}});
								});
							} else if (r_game[0].type="democracia"){
								g_object.db.update('cardsxround', {card_id: parseInt(card_id), game_id: r_game[0].game_id}, { "votes": (parseInt(r_cards[0].votes)+1)}, function (){
									g_object.db.sumax('cardsxround', 'votes', {game_id: r_game[0].game_id}, function(cxr){
										if (cxr[0].sum == r_game[0].n_players){
											g_object.db.sortFind('cardsxround', {game_id: r_game[0].game_id}, {"votes": -1}, 1, function (card){
												g_object.db.find('players', {user_id: card[0].user_id}, function(player){
													callback({status: "OK", data: {game: r_game[0], player: player[0], cards: r_cards[0], players: r_players}});
												});
											});
										} else {
											callback({status: "VOTED"}); 
										}
									});
								});
							} else callback({status: "ERR", msg: "ERR_UNEXPECTED"});
						});
					});
				});
			});
		});
	});
};


//roundWinner: r_winner, r_game, room_id, callback
method.roundWinner = function (r_winner, r_game, room_id, win_callback, round_callback) {
	var g_object = this;
	//Comprueba si se ha acabado la partida
	if (r_winner.points+1 >= r_game.n_cardstowin){
		//Devuelve el estado de WIN y borra la partida
		g_object.deleteGame(r_game.creator_id, room_id, function (res){
			if (res.status != "ERR") win_callback({status: "WIN"});
			else win_callback(res);
		});
	} else {
		//Actualiza los puntos del ganador de la ronda
		g_object.db.update('players', {user_id: r_winner.user_id}, {"points": (parseInt(r_winner.points)+1)}, function () {
			//Borra las cartas enviadas en la ronda actual
			g_object.db.remove('cardsxround', {game_id: r_game.game_id}, function (){
				//Se realiza una accion diferente segun el tipo
				if (r_game.type == "dictadura" || r_game.type == "democracia"){
					round_callback({status: "OK"});
				} else if (r_game.type=="clasico"){
					var dictador = 0;
					if (parseInt(r_game.dictator_id)+1 <= r_game.n_players) dictador = parseInt(r_game.dictator_id)+1;
					else dictador = 1;
					//Cambia el lider de la ronda
					g_object.db.update('games', {game_id: r_game.game_id}, {"dictator_id": dictador}, function () {
						r_game.dictator_id = dictador;
						round_callback({status: "OK"});
					});
				} else round_callback({status: "ERR", msg: "ERR_UNEXPECTED_TYPE"});
			});
		});
	}
};

//deleteGame: game_id, creator_id, room_id, callback
method.deleteGame = function (creator_id, room_id, callback) {
	var g_object = this;
	//Comprueba que el grupo tenga una partida creada.
	g_object.db.find('games', {room_id: room_id}, function(r_game) {
		//En el caso de que no tenga una partida creada
		if (!r_game.length) {
			callback({status: "ERR", msg: "ERR_NO_ACTIVE_GAMES"});
			return;
		}
		//Comprueba que el usuario que la borra es el mismo que la creo.
		if (r_game[0].creator_id != creator_id){
			callback({status: "ERR", msg: "ERR_CREATOR_DELETE", extra: {creator_name: r_game[0].creator_name}});
			return;
		}
		//Borra la partida
		g_object.db.remove('games', {game_id: r_game[0].game_id}, function (){
			g_object.db.remove('players', {game_id: r_game[0].game_id}, function (){
				g_object.db.remove('wcardsxgame', {game_id: r_game[0].game_id});
				g_object.db.remove('bcardsxgame', {game_id: r_game[0].game_id});
				g_object.db.remove('cardsxround', {game_id: r_game[0].game_id});
				callback({status: "OK"});
			});
		});
	});
};


//Export the game
module.exports = Game;
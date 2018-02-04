//ToDo: Al consultar la BD usar el callback de 2 parametros (err, response) para propagar errores y usar el metodo del return; para capturarlos
//ToDo: Donde entra por parametro r_game hay que limitar la informacion que recibe a solo la que va a usar
var Db = require('./db');

//////////CREATE CLASS//////////
var method = Game.prototype;

//////////CONSTRUCTOR//////////
function Game(url, db, callback) {
	this.db = new Db(url, db, callback);
	this.minPlayers = 3;
}

//////////AUX METHODS//////////
method.getUsername = function(msg){
	var name = msg.from.first_name;
	if(typeof msg.from.last_name != "undefined") name += " "+msg.from.last_name;
	if(typeof msg.from.username != "undefined") name += " (@"+msg.from.username+")";
	return name
};
method.inArray = function(array, key, value){
	existe = false;
	for (i = 0; i<array.length && !existe; i++){
		if (array[i][key] === value) existe = true;
	}
	return existe;
};
method.shuffleArray = function(array){
    for(var j, x, i = array.length; i; j = Math.floor(Math.random() * i), x = array[--i], array[i] = array[j], array[j] = x);
    return array;
};

//////////GAME//////////
//createUser: data {user_id, username}, callback
method.createUser = function (data, callback){
	var g_object = this;
	g_object.db.count('players', {user_id: data.user_id}, function (count_player) {
		if (count_player){
			callback({status: "ERR", msg: "ERR_ALREADY_IN_GAME"});
			return;
		}
		g_object.db.insert('players', data, function (res) {
			if (res.status == "ERR"){
				callback({status: "ERR", msg: res});
				return;
			}
			callback({status: "OK", msg: res});
		});
	});
};

//modifyUser: {user_id, update_data, callback}
method.modifyUser = function (user_id, update_data, callback){
	var g_object = this;
	g_object.db.count('players', {user_id: user_id}, function (count_player) {
		if (!count_player){
			callback({status: "ERR", msg: "ERR_NOT_IN_GAME"});
			return;
		}
		g_object.db.update('players', {user_id: user_id}, update_data, function (res) {
			if (res.status == "ERR"){
				callback({status: "ERR", msg: res});
				return;
			}
			callback({status: "OK", msg: res});
		});
	});
};

//getUser: user_id, callback
method.getUser = function (user_id, callback) {
	var g_object = this;
	if (typeof user_id == "number") search = {user_id: user_id};
	else search = {_id: user_id};
	g_object.db.find('players', search, function (array){
		if (!array.length){
			callback({status: "ERR", msg: "ERR_NOT_IN_GAME"});
			return;
		}
		callback({status: "OK", msg: array[0]});
	});
};

//leaveUser: player_id, callback
//ToDo: pasar comprobaciones a este metodo
method.leaveUser = function (player_id, callback){
	var g_object = this;
	g_object.db.update('players', {_id: g_object.db.getObjectId(player_id)}, {status: 0}, function (res){
		if (res.status == "ERR") callback(res);
		else {
			g_object.db.remove('playersxgame', {player_id: g_object.db.getObjectId(player_id)}, function (res){
				if (res.status == "ERR") callback(res);
				else callback({status: "OK"});
			});
		}
	});
};

//leaveUser: game_id, callback
method.freeUsers = function (game_id, callback){
	var g_object = this;
	g_object.db.find('playersxgame', {game_id: g_object.db.getObjectId(game_id)}, function (res){
		if (res.status == "ERR") callback(res);
		else {
			for (var i = 0; i < res.length; i++){
				g_object.db.update('players', {_id: g_object.db.getObjectId(res[i].player_id)}, {status: 0}, function (res){
					if (res.status == "ERR") callback(res);
				});
			}
			callback({status: "OK"});
		}
	});
};

//createGame: data {room_id, from_id, status}, callback
method.createGame = function(data, callback){
	var g_object = this;
	//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
	g_object.db.count('games', {room_id: data.room_id}, function(count_games) {
		//Si hay partida en este grupo
		if (count_games) {
			callback({status: "ERR", msg: "ERR_ACTIVE_GAME"});
			return;
		}
		g_object.db.insert('games', data, function (res) {
			if (res.status == "ERR"){
				callback({status: "ERR", msg: res});
				return;
			}
			callback({status: "OK", msg: {game_id: res.insertedId}});
		});
	});
};

//modifyGame: new_data {}, callback
method.modifyGame = function(game_id, new_data, callback){
	var g_object = this;
	//Buscamos en la tabla games si el grupo desde el que se invoca no tiene partida o ya esta iniciada
	g_object.db.find('games', {_id: g_object.db.getObjectId(game_id)}, function(r_games) {
		//Si no encuentra resultados
		if (!r_games.length) {
			callback({status: "ERR", msg: "ERR_BAD_GAME"});
			return;
		}
		g_object.db.update('games', {_id: g_object.db.getObjectId(game_id)}, new_data, function (res) {
			if (res.status == "ERR"){
				callback({status: "ERR", msg: res});
				return;
			}
			callback({status: "OK"});
		});
	});
};

//joinGame: data {data.game_id, data.user_id, data.username}, callback
method.joinGame = function(data, callback){
	var g_object = this;
	//Comprueba que el grupo tenga una partida creada.
	g_object.db.find('games', {_id: g_object.db.getObjectId(data.game_id)}, function(r_game) {
		//En el caso de que no tenga una partida creada
		if (!r_game.length) {
			callback({status: "ERR", msg: "ERR_UNKNOWN_GAME"});
			return;
		}
		//Comprobamos que la partida no esté iniciada
		if (parseInt(r_game[0].status) != 0){
			callback({status: "ERR", msg: "ERR_ALREADY_STARTED"});
			return;
		}
		g_object.db.count('playersxgame', {game_id: g_object.db.getObjectId(data.game_id)}, function(count_players){
			//Comprobamos que la sala no este llena
			if (count_players >= r_game[0].n_players){
				callback({status: "ERR", msg: "ERR_ALREADY_FILLED", data: count_players+" >= "+r_game[0].n_players});
				return;
			}
			if (r_game[0].type == "clasico"){
				//Añadimos un contador para el orden
				data.order = count_players+1;
			}
			//Insertamos en la base de datos
			g_object.db.update('players', {_id: g_object.db.getObjectId(data.player_id)}, {status: 1}, function (res){
				if (res.status == "ERR") callback(res);
				else {
					g_object.db.insert('playersxgame', data, function(){
						if (count_players+1 == r_game[0].n_players){ //Cuando ya han entrado todos los jugadores
							g_object.db.update('games', {_id: g_object.db.getObjectId(data.game_id)}, {status: 1}, function (res) {
								if (res.status == "ERR"){
									callback({status: "ERR", msg: res});
									return;
								}
							});
						}
						callback({status: "OK"});
					});
				}
			});
		});
	});
};

//startGame: player_id, game_id, callback
method.startGame = function (player_id, game_id, callback){
	var g_object = this;
	//Comprueba que el grupo tenga una partida creada.
	g_object.db.find('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
		//En el caso de que no tenga una partida creada
		if (!r_game.length) {
			callback({status: "ERR", msg: "ERR_NO_ACTIVE_GAMES"});
			return;
		}
		//En el caso de que tenga una partida comprueba que el usuario que la borra es el mismo que la creo.
		if (r_game[0].creator_id.toString() != player_id.toString()){
			callback({status: "ERR", msg: "ERR_NOT_CREATOR_START"});
			return;
		}
		//Comprobamos
		if (parseInt(r_game[0].status) == -1){
			callback({status: "ERR", msg: "ERR_STILL_CREATING"});
			return;
		} else if (parseInt(r_game[0].status) == 2){
			callback({status: "ERR", msg: "ERR_ALREADY_STARTED"});
			return;
		}
		g_object.db.find('playersxgame', {game_id: g_object.db.getObjectId(game_id)}, function(r_players){
			if (parseInt(r_game[0].status) == 0){
				callback({status: "ERR", msg: "ERR_NOT_ENOUGHT_PLAYERS", extra: {current_players: r_players.length, max_players: r_game[0].n_players}});
				return;
			}
			g_object.db.update('games', {_id: g_object.db.getObjectId(game_id)}, {status: 2}, function () {
				callback({status: "OK", msg: {game: r_game[0], players: r_players}});
			});
		});
	});
};

//deleteGame: game_id, player_id, game_id, callback
method.deleteGame = function (player_id, game_id, callback) {
	var g_object = this;
	//Comprueba que el grupo tenga una partida creada.
	g_object.db.find('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
		//En el caso de que no tenga una partida creada
		if (!r_game.length) {
			callback({status: "ERR", msg: "ERR_NO_ACTIVE_GAMES"});
			return;
		}
		//Comprueba que el usuario que la borra es el mismo que la creo.
		if (r_game[0].creator_id.toString() == player_id.toString()){
			//Borra la partida
			g_object.freeUsers(game_id, function(){
				g_object.db.remove('games', {_id: g_object.db.getObjectId(game_id)}, function (){
					g_object.db.remove('playersxgame', {game_id: g_object.db.getObjectId(game_id)}, function (){
						callback({status: "OK"});
					});
				});
			});
		} else {
			g_object.db.count('playersxgame', {game_id: g_object.db.getObjectId(game_id), player_id: g_object.db.getObjectId(player_id)}, function(count_players){
				if (!count_players){
					callback({status: "ERR", msg: "ERR_NOT_IN_THIS_GAME"});
					return;
				}
				g_object.db.count('votedeletexgame', {game_id: g_object.db.getObjectId(game_id), player_id: g_object.db.getObjectId(player_id)}, function(player_voted){
					if (player_voted){
						callback({status: "ERR", msg: "ERR_ALREADY_VOTED"});
						return;
					}
					g_object.db.count('votedeletexgame', {game_id: g_object.db.getObjectId(game_id)}, function(count_votes){
						if (count_votes+1 >= Math.trunc(r_game[0].n_players/2)+1){
							g_object.freeUsers(game_id, function(){
								g_object.db.remove('games', {_id: g_object.db.getObjectId(game_id)}, function (){
									g_object.db.remove('playersxgame', {game_id: g_object.db.getObjectId(game_id)}, function (){
										callback({status: "OK"});
									});
								});
							});
						} else {
							g_object.db.insert('votedeletexgame', {game_id: g_object.db.getObjectId(game_id), player_id: g_object.db.getObjectId(player_id)}, function (){
								callback({status: "VOTED", msg: {votes: count_votes+1, n_players: Math.trunc(r_game[0].n_players/2)+1}});
							});
						}
					});
				});
			});
		}
	});
};

//ToDo: revisar que funcione
method.leaveGame = function (player_id, game_id, callback) {
	var g_object = this;
	g_object.db.count('playersxgame', {player_id: g_object.db.getObjectId(player_id), game_id: g_object.db.getObjectId(game_id)}, function(r_player){
		if (!r_player){
			callback({status: "ERR", msg: "ERR_NO_GAME_PARTICIPANT"});
			return;
		}
		g_object.db.find('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
			if (!r_game.length) {
				callback({status: "ERR", msg: "ERR_NO_ACTIVE_GAMES"});
				return;
			}
			if (r_game[0].creator_id.toString() == player_id.toString()){
				callback({status: "ERR", msg: "ERR_CREATOR_CANT_LEAVE"});
				return;
			}
			if (r_game[0].status == 2){ //Partida iniciada
				//Eres el ultimo, se borra la partida
				if (r_game[0].n_players-1 < g_object.minPlayers) callback({status: "OK", msg: "DELETE_GAME"});
				else callback({status: "OK", msg: "DELETE_PLAYER_STARTED"}); //No eres el ultimo
			} else callback({status: "OK", msg: "DELETE_PLAYER_NOT_STARTED"}); //Partida sin iniciar
		});
	});
};

////////////METODOS PROPIOS///////////
//startRound: r_game, r_players, callback
method.startRound = function (r_game, r_players, msg_callback, callback) {
	var g_object = this;
	g_object.db.update('games', {_id: r_game._id}, {currentblack: (parseInt(r_game.currentblack)+1)}, function () {
		g_object.db.limitFind('bcardsxgame', {game_order: (parseInt(r_game.currentblack)+1), game_id: r_game._id}, 1, function (bcard){
			if (!bcard.length){
				callback({status: "ERR", msg: "ERR_UNEXPECTED"});
				return;
			}
			for (i = 0; i < r_players.length; i++){
				(function(i) {
					g_object.db.limitFind('wcardsxgame', {player_id: g_object.db.getObjectId(r_players[i].player_id), game_id: g_object.db.getObjectId(r_game._id), used: 0}, 5, function (wcard){
						var buttonarray = [];
						var cardstext = "";
						for (j = 0; j < wcard.length;j++){
							buttonarray.push({id: wcard[j]._id, text: wcard[j].card_text});
							cardstext += (j+1)+". "+wcard[j].card_text+"\n";
						}
						if (((r_game.type=="dictadura" || r_game.type=="clasico") && r_players[i].player_id.toString() != r_game.president_id.toString()) || r_game.type == "democracia") 
							msg_callback(r_players[i].player_uid, bcard[0].card_text, buttonarray, cardstext);
					});
				})(i);
			}
			callback({status: "OK", data: {blackcard: bcard[0].card_text, game_type: r_game.type}});
		});
	});
};
//sendCard
method.sendCard = function (player_id, game_id, card_id, callback) {
	var g_object = this;
	g_object.db.find('playersxgame', {player_id: g_object.db.getObjectId(player_id), game_id: g_object.db.getObjectId(game_id)}, function(r_player){
		if (!r_player.length){
			callback({status: "ERR", msg: "ERR_USER_NO_GAME"});
			return;
		}
		g_object.db.find('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
			if (!r_game.length) {
				callback({status: "ERR", msg: "ERR_GAME_DELETED"});
				return;
			}
			if (r_game[0].status != 2){
				callback({status: "ERR", msg: "ERR_GAME_NOT_STARTED"});
				return;
			}
			g_object.db.count('cardsxround', {player_id: g_object.db.getObjectId(player_id)}, function(w_sent){
				if (w_sent){
					callback({status: "ERR", msg: "ERR_USER_ALREADY_RESPONSED"});
					return;
				}
				if ((r_game[0].type=="dictadura" && r_game[0].creator_id == player_id) || (r_game[0].type=="clasico" && r_game[0].dictator_uid == player_id)){
					callback({status: "ERR", msg: "ERR_DICTATOR_NOT_ALLOWED"});
					return;
				}
				g_object.db.count('cardsxround', {game_id: g_object.db.getObjectId(game_id)}, function(n_cards){
					if (n_cards >= r_game[0].n_players){
						callback({status: "ERR", msg: "ERR_ALL_ALREADY_RESPONSED"});
						return;
					}
					g_object.db.find('wcardsxgame', {_id: g_object.db.getObjectId(card_id), used: 0}, function(r_card) {
						if (!r_card.length) {
							callback({status: "ERR", msg: "ERR_CARD_ALREADY_USED"});
							return;
						}
						g_object.db.limitFind('bcardsxgame', {game_order: (parseInt(r_game[0].currentblack)), game_id: g_object.db.getObjectId(game_id)}, 1, function (bcard){
							if (!bcard.length){
								callback({status: "ERR", msg: "ERR_UNEXPECTED_BCARD"});
								return;
							}
							g_object.db.insert('cardsxround', {card_id: g_object.db.getObjectId(card_id), card_text: r_card[0].card_text, game_id: g_object.db.getObjectId(game_id), player_id: g_object.db.getObjectId(player_id), player_uid: r_player[0].player_uid, votes: 0}, function(){
								g_object.db.update('wcardsxgame', {_id: g_object.db.getObjectId(card_id), game_id: g_object.db.getObjectId(game_id), player_id: r_player[0].player_id}, {used:1}, function (){
									//Si no eres el ultimo en votar
									if ((r_game[0].type=="dictadura" && n_cards+1 < r_game[0].n_players-1) || 
										(r_game[0].type=="clasico" && n_cards+1 < r_game[0].n_players-1) || 
										(r_game[0].type=="democracia" && n_cards+1 < r_game[0].n_players)){
											callback({status: "OK", data: {status: "NORMAL",  wcard_text: r_card[0].card_text, blackcard: bcard[0].card_text}});
										}
									else if ((r_game[0].type=="dictadura" && n_cards+1 == r_game[0].n_players-1) || 
										(r_game[0].type=="clasico" && n_cards+1 == r_game[0].n_players-1) || 
										(r_game[0].type=="democracia" && n_cards+1 == r_game[0].n_players)) //Si eres el ultimo en votar
									{
										var textgroup = "";
										var array = [];
										//Creamos el array con los votos
										g_object.db.find('cardsxround', {game_id: g_object.db.getObjectId(game_id)}, function(r_cards){
											for (i = 0; i<r_cards.length; i++){
												textgroup += (i+1)+". "+r_cards[i].card_text+"\n";
												array.push({"id": r_cards[i].card_id, "text": r_cards[i].card_text});
											}
											if (r_game[0].type == "dictadura" || r_game[0].type == "clasico"){//Dictadura solo vota el lider
												g_object.db.find('playersxgame', {player_id: g_object.db.getObjectId(r_game[0].president_id), game_id: g_object.db.getObjectId(game_id)}, function(dictator){
													if (!dictator.length) {
														callback({status: "ERR", msg: "ERR_DICTATOR"});
														return;
													}
													callback({status: "OK", data: {status: "END", wcard_text: r_card[0].card_text, card_array: array, card_string: textgroup, game_type: r_game[0].type, room_id: r_game[0].room_id, blackcard: bcard[0].card_text, player_id: dictator[0].player_uid}});
												});
											} else if (r_game[0].type == "democracia"){//Democracia votan todos
												var player_ids = [];
												for (i = 0; i<r_cards.length; i++){
													player_ids.push(r_cards[i].player_uid);
												}
												callback({status: "OK", data: {status: "END", wcard_text: r_card[0].card_text, card_array: array, card_string: textgroup, game_type: r_game[0].type, room_id: r_game[0].room_id, blackcard: bcard[0].card_text, player_id: player_ids}});
											} 
										});
									} else callback({status: "ERR", msg: "ERR_UNEXPECTED"});
								});
							});
						});
					});
				});
			});
		});
	});
};
//sendVote
method.sendVote = function (player_id, game_id, card_id, callback) {
	var g_object = this;
	g_object.db.find('playersxgame', {player_id: g_object.db.getObjectId(player_id), game_id: g_object.db.getObjectId(game_id)}, function(r_player){
		if (!r_player.length){
			callback({status: "ERR", msg: "ERR_USER_NO_GAME"});
			return;
		}
		g_object.db.find('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
			if (!r_game.length) {
				callback({status: "ERR", msg: "ERR_GAME_DELETED"});
				return;
			}
			if (r_game[0].status != 2){
				callback({status: "ERR", msg: "ERR_GAME_NOT_STARTED"});
				return;
			}
			g_object.db.count('cardsxround', {game_id: g_object.db.getObjectId(game_id)}, function(n_cards){
				if (n_cards < r_game[0].n_players-1){
					callback({status: "ERR", msg: "ERR_ALL_NOT_ALREADY_RESPONSED"});
					return;
				}
				g_object.db.find('cardsxround', {card_id: g_object.db.getObjectId(card_id), game_id: g_object.db.getObjectId(game_id)}, function (r_card){
					if (!r_card.length){
						callback({status: "ERR", msg: "ERR_CARD_NOT_FOUND"});
						return;
					}
					g_object.db.find('playersxgame', {game_id: g_object.db.getObjectId(game_id)}, function(r_players){
						if (!r_players.length){
							callback({status: "ERR", msg: "ERR_UNEXPECTED_PLAYERS"});
							return;
						}
						if (r_game[0].type=="dictadura" || r_game[0].type=="clasico"){
							if (r_game[0].president_id.toString() != r_player[0].player_id.toString()){
								callback({status: "ERR", msg: "ERR_DICTATOR_ONLY_ALLOWED"});
								return;
							}
							g_object.db.find('playersxgame', {player_id: g_object.db.getObjectId(r_card[0].player_id)}, function(player){
								if (!player.length){
									callback({status: "ERR", msg: "ERR_UNEXPECTED_PLAY"});
									return;
								}
								callback({status: "OK", data: {game: r_game[0], player: player[0], cards: r_card[0], vote: r_card[0], players: r_players}});
							});
						} else if (r_game[0].type="democracia"){
							g_object.db.insert('votesxround', {player_id: g_object.db.getObjectId(player_id), card_id: g_object.db.getObjectId(card_id), game_id: g_object.db.getObjectId(game_id)}, function (){
								g_object.db.count('votesxround', {game_id: g_object.db.getObjectId(game_id)}, function (count_res){
									if (count_res == r_game[0].n_players){
										g_object.db.getMax('votesxround', 'card_id', {game_id: g_object.db.getObjectId(game_id)}, function (response){
											if (!response.length){
												callback({status: "ERR", msg: "ERR_UNEXPECTED_DEMOCRACY_CARD"});
												return;
											}
											g_object.db.find('cardsxround', {card_id: response[0]._id, game_id: g_object.db.getObjectId(game_id)}, function (card){
												g_object.db.find('playersxgame', {player_id: card[0].player_id, game_id: g_object.db.getObjectId(game_id)}, function(player){
													if (!player.length){
														callback({status: "ERR", msg: "ERR_UNEXPECTED_DEMOCRACY"});
														return;
													}
													callback({status: "OK", data: {game: r_game[0], player: player[0], cards: card[0], vote: r_card[0], players: r_players}});
												});
											});
										});
									} else {
										callback({status: "VOTED", data: {vote: r_card[0]}}); 
									}
								});
							});
						} else callback({status: "ERR", msg: "ERR_UNEXPECTED"});
					});
				});
			});
		});
	});
};
//roundWinner: r_winner, r_game, callback
method.roundWinner = function (r_winner, r_game, win_callback, round_callback) {
	var g_object = this;
	//Comprueba si se ha acabado la partida
	if (r_winner.points+1 >= r_game.n_cardstowin){
		//Devuelve el estado de OK y borra la partida
		g_object.deleteGame(r_game.creator_id, r_game._id, function (res){
			if (res.status == "ERR") {
				win_callback(res);
				return;
			}
			win_callback({status: "OK"});
		});
	} else {
		//Actualiza los puntos del ganador de la ronda
		g_object.db.update('playersxgame', {player_id: g_object.db.getObjectId(r_winner.player_id)}, {"points": (parseInt(r_winner.points)+1)}, function () {
			//Borra las cartas enviadas en la ronda actual
			g_object.db.remove('cardsxround', {game_id: g_object.db.getObjectId(r_game._id)}, function (){
				g_object.db.remove('votesxround', {game_id: g_object.db.getObjectId(r_game._id)}, function (){
					//Se realiza una accion diferente segun el tipo
					if (r_game.type == "dictadura" || r_game.type == "democracia"){
						round_callback({status: "OK", msg: {game:r_game}});
					} else if (r_game.type=="clasico"){
						var president_order = parseInt(r_game.president_order);
						if (president_order+1 <= r_game.n_players) president_order = president_order+1;
						else president_order = 1;
						//Cambia el lider de la ronda
						g_object.db.find('playersxgame', {order: president_order, game_id: g_object.db.getObjectId(r_game._id)}, function (president_res){
							g_object.db.update('games', {_id: g_object.db.getObjectId(r_game._id)}, {president_order: president_order, president_id: president_res[0].player_id}, function (up_res) {
								r_game.president_order = president_order;
								r_game.president_id = president_res[0].player_id;
								round_callback({status: "OK", msg: {game:r_game}});
							});
						});
					} else round_callback({status: "ERR", msg: "ERR_UNEXPECTED_TYPE"});
				});
			});
		});
	}
};
//checkCards: game_id, callback
method.checkCards = function (game_id, callback){
	var g_object = this;
	//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
	g_object.db.find('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
		if (!r_game.length) {
			callback({status: "ERR", msg: "ERR_NO_ACTIVE_GAMES"});
			return;
		}
		if (parseInt(r_game[0].status != 2)){
			callback({status: "ERR", msg: "ERR_GAME_NOT_STARTED"});
			return;
		}
		g_object.db.find('playersxgame', {game_id: g_object.db.getObjectId(game_id)}, function(r_players){
			g_object.db.find('cardsxround', {game_id: g_object.db.getObjectId(game_id)}, function (r_cards){
				if (r_players.length == r_cards.length){
					callback({status: "ERR", msg: "ERR_USER_ALREADY_RESPONSED"});
					return;
				}
				var texto = "";
				for (i=0; i<r_players.length;i++){
					existe = false;
					for (j=0; j<r_cards.length;j++){
						if (r_players[i].player_id.toString() == r_cards[j].player_id.toString()) {
							if (r_game[0].type == "democracia") existe = true;
							else if (r_players[i].order != r_game[0].president_id) existe = true;
						}
					}
					if (!existe) texto += r_players[i].player_username+"\n";
				}
				//ToDo: devolver array
				callback({status: "OK", data: {players: texto}});
			});
		});
	});
};
//checkVotes: game_id, callback
method.checkVotes = function (game_id, callback){
	var g_object = this;
	//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
	g_object.db.find('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
		if (!r_game.length) {
			callback({status: "ERR", msg: "ERR_NO_ACTIVE_GAMES"});
			return;
		}
		if (parseInt(r_game[0].status != 2)){
			callback({status: "ERR", msg: "ERR_GAME_NOT_STARTED"});
			return;
		}
		g_object.db.find('playersxgame', {game_id: g_object.db.getObjectId(game_id)}, function(r_players){
			g_object.db.find('cardsxround', {game_id: g_object.db.getObjectId(game_id)}, function (r_cards){
				g_object.db.find('votesxround', {game_id: g_object.db.getObjectId(game_id)}, function (r_votes){
					if (r_players.length != r_cards.length){
						callback({status: "ERR", msg: "ERR_CARDS_UNSENT"});
						return;
					}
					if (r_players.length == r_votes.length){
						callback({status: "ERR", msg: "ERR_USER_ALREADY_VOTED"});
						return;
					}
					var texto = "";
					for (i=0; i<r_players.length;i++){
						existe = false;
						for (j=0; j<r_votes.length;j++){
							if (r_players[i].player_id.toString() == r_votes[j].player_id.toString()) {
								if (r_game[0].type == "democracia") existe = true;
								else if (r_players[i].order != r_game[0].president_id) existe = true;
							}
						}
						if (!existe) texto += r_players[i].player_username+"\n";
					}
					//ToDo: devolver array
					callback({status: "OK", data: {players: texto}});
				});
			});
		});
	});
};

//Export the game
module.exports = Game;
var Db = require('./db');

//////////CREATE CLASS//////////
var method = Game.prototype;

//////////CONSTRUCTOR//////////
function Game(url, db, callback) {
	this.db = new Db(url, db, callback);
	this.minPlayers = 3;
}

//////////AUX METHODS//////////
//getUsername: user {first_name, last_name, username}
method.getUsername = function(user){
	var name = user.first_name;
	if(typeof user.last_name != "undefined") name += " "+user.last_name;
	if(typeof user.username != "undefined") name += " (@"+user.username+")";
	return name
};

//inArray: array, key, value
method.inArray = function(array, key, value){
	existe = false;
	for (i = 0; i<array.length && !existe; i++){
		if (array[i][key] === value) existe = true;
	}
	return existe;
};

//shuffleArray: array
method.shuffleArray = function(array){
    for(var j, x, i = array.length; i; j = Math.floor(Math.random() * i), x = array[--i], array[i] = array[j], array[j] = x);
    return array;
};

//////////GAME//////////
//createUser: data {user_id, ...}, callback
method.createUser = function (data, callback){
	var g_object = this;
	g_object.db.count('players', {user_id: data.user_id}, function (count_player) {
		if (count_player){
			callback({status: "ERR", msg: "ERR_ALREADY_IN_GAME"});
			return;
		}
		g_object.db.insertOne('players', data, function (res) {
			if (res.status == "ERR"){
				callback({status: "ERR", msg: res});
				return;
			}
			callback({status: "OK", msg: res});
		});
	});
};

//modifyUser: {player_id, new_data, callback}
method.modifyUser = function (player_id, new_data, callback){
	var g_object = this;
	g_object.db.count('players', {user_id: player_id}, function (count_player) {
		if (!count_player){
			callback({status: "ERR", msg: "ERR_NOT_IN_GAME"});
			return;
		}
		g_object.db.updateOne('players', {user_id: player_id}, new_data, function (res) {
			if (res.status == "ERR"){
				callback({status: "ERR", msg: res});
				return;
			}
			callback({status: "OK", msg: res});
		});
	});
};

//getUser: player_id, callback
method.getUser = function (player_id, callback) {
	var g_object = this;
	if (typeof player_id == "number") search = {user_id: player_id};
	else search = {_id: player_id};
	g_object.db.findOne('players', search, function (r){
		if (!r){
			callback({status: "ERR", msg: "ERR_NOT_IN_GAME"});
			return;
		}
		callback({status: "OK", msg: r});
	});
};

//createGame: data {room_id, creator_id, ...}, callback
method.createGame = function(data, callback){
	var g_object = this;
	//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
	g_object.db.count('games', {room_id: data.room_id}, function(count_room) {
		//Si hay partida en este grupo
		if (count_room) {
			callback({status: "ERR", msg: "ERR_ACTIVE_GAME"});
			return;
		}
		g_object.db.count('playersxgame', {player_id: data.creator_id}, function (count_player){
			if (count_player) {
				callback({status: "ERR", msg: "ERR_ALREADY_PLAYING"});
				return;
			}
			//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
			g_object.db.count('games', {creator_id: data.creator_id}, function(count_games) {
				//Si hay partida en este grupo
				if (count_games) {
					callback({status: "ERR", msg: "ERR_ALREADY_CREATING"});
					return;
				}
				g_object.db.insertOne('games', data, function (res) {
					if (res.status == "ERR"){
						callback({status: "ERR", msg: res});
						return;
					}
					callback({status: "OK", msg: {game_id: res.insertedId}});
				});
			});
		});
	});
};

//modifyGame: new_data {}, callback
method.modifyGame = function(game_id, new_data, callback){
	var g_object = this;
	//Buscamos en la tabla games si el grupo desde el que se invoca no tiene partida o ya esta iniciada
	g_object.db.count('games', {_id: g_object.db.getObjectId(game_id)}, function(r_games) {
		//Si no encuentra resultados
		if (!r_games) {
			callback({status: "ERR", msg: "ERR_BAD_GAME"});
			return;
		}
		g_object.db.updateOne('games', {_id: g_object.db.getObjectId(game_id)}, new_data, function (res) {
			if (res.status == "ERR"){
				callback({status: "ERR", msg: res});
				return;
			}
			callback({status: "OK"});
		});
	});
};

//joinGame: data {game_id, player_id, ...}, callback
method.joinGame = function(data, callback){
	var g_object = this;
	//Comprueba que el grupo tenga una partida creada.
	g_object.db.findOne('games', {_id: g_object.db.getObjectId(data.game_id)}, function(r_game) {
		//En el caso de que no tenga una partida creada
		if (!r_game) {
			callback({status: "ERR", msg: "ERR_UNKNOWN_GAME"});
			return;
		}
		//Comprobamos que la partida no esté iniciada
		if (parseInt(r_game.status) < 0){
			callback({status: "ERR", msg: "ERR_STILL_CREATING"});
			return;
		} else if (parseInt(r_game.status) > 0){
			callback({status: "ERR", msg: "ERR_ALREADY_STARTED"});
			return;
		}
		g_object.db.count('playersxgame', {player_id: data.player_id}, function (count_player){
			if (count_player) {
				callback({status: "ERR", msg: "ERR_ALREADY_PLAYING"});
				return;
			}
			//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
			g_object.db.count('games', {creator_id: data.player_id, _id: {'$ne': r_game._id}}, function(count_games) {
				//Si hay partida en este grupo
				if (count_games) {
					callback({status: "ERR", msg: "ERR_ALREADY_CREATING"});
					return;
				}
				g_object.db.count('playersxgame', {game_id: g_object.db.getObjectId(data.game_id)}, function(count_players){
					//Comprobamos que la sala no este llena
					if (count_players >= r_game.n_players){
						callback({status: "ERR", msg: "ERR_ALREADY_FILLED", data: count_players+" >= "+r_game.n_players});
						return;
					}
					//Añadimos un contador para el orden de entrada
					data.order = count_players+1;
					//Insertamos en la base de datos
					g_object.db.insertOne('playersxgame', data, function(res){
						if (res.status == "ERR") {
							callback(res);
							return;
						}
						callback({status: "OK"});
					});
				});
			});
		});
	});
};

//startGame: player_id, game_id, callback
method.startGame = function (player_id, game_id, callback){
	var g_object = this;
	//Comprueba que el grupo tenga una partida creada.
	g_object.db.findOne('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
		//En el caso de que no tenga una partida creada
		if (!r_game) {
			callback({status: "ERR", msg: "ERR_NO_ACTIVE_GAMES"});
			return;
		}
		//En el caso de que tenga una partida comprueba que el usuario que la borra es el mismo que la creo.
		if (r_game.creator_id.toString() != player_id.toString()){
			callback({status: "ERR", msg: "ERR_NOT_CREATOR_START"});
			return;
		}
		//Comprobamos
		if (parseInt(r_game.status) < 0){
			callback({status: "ERR", msg: "ERR_STILL_CREATING"});
			return;
		} else if (parseInt(r_game.status) > 0){
			callback({status: "ERR", msg: "ERR_ALREADY_STARTED"});
			return;
		}
		g_object.db.findMany('playersxgame', {game_id: g_object.db.getObjectId(game_id)}, function(r_players){
			if (r_players.length != r_game.n_players){
				callback({status: "ERR", msg: "ERR_NOT_ENOUGHT_PLAYERS", extra: {current_players: r_players.length, max_players: r_game.n_players}});
				return;
			}
			g_object.db.updateOne('games', {_id: g_object.db.getObjectId(game_id)}, {status: 1}, function () {
				callback({status: "OK", msg: {game: r_game, players: r_players}});
			});
		});
	});
};

//deleteGame: game_id, player_id, game_id, callback
method.deleteGame = function (player_id, game_id, callback) {
	var g_object = this;
	//Comprueba que el grupo tenga una partida creada.
	g_object.db.findOne('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
		//En el caso de que no tenga una partida creada
		if (!r_game) {
			callback({status: "ERR", msg: "ERR_NO_ACTIVE_GAMES"});
			return;
		}
		//Comprueba que el usuario que la borra es el mismo que la creo.
		if (r_game.creator_id.toString() == player_id.toString()){
			//Borra la partida
			g_object.db.remove('games', {_id: g_object.db.getObjectId(game_id)}, function (){
				g_object.db.remove('playersxgame', {game_id: g_object.db.getObjectId(game_id)}, function (){
					callback({status: "OK"});
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
						if (count_votes+1 >= Math.trunc(r_game.n_players/2)+1){
							g_object.db.remove('games', {_id: g_object.db.getObjectId(game_id)}, function (){
								g_object.db.remove('playersxgame', {game_id: g_object.db.getObjectId(game_id)}, function (){
									callback({status: "OK"});
								});
							});
						} else {
							g_object.db.insertOne('votedeletexgame', {game_id: g_object.db.getObjectId(game_id), player_id: g_object.db.getObjectId(player_id)}, function (){
								callback({status: "VOTED", msg: {votes: count_votes+1, n_players: Math.trunc(r_game.n_players/2)+1}});
							});
						}
					});
				});
			});
		}
	});
};

//leaveGame: player_id, game_id, callback
method.leaveGame = function (player_id, game_id, callback) {
	var g_object = this;
	g_object.db.count('playersxgame', {player_id: g_object.db.getObjectId(player_id), game_id: g_object.db.getObjectId(game_id)}, function(r_player){
		if (!r_player){
			callback({status: "ERR", msg: "ERR_NO_GAME_PARTICIPANT"});
			return;
		}
		g_object.db.findOne('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
			if (!r_game) {
				callback({status: "ERR", msg: "ERR_NO_ACTIVE_GAMES"});
				return;
			}
			if (r_game.creator_id.toString() == player_id.toString()){
				callback({status: "ERR", msg: "ERR_CREATOR_CANT_LEAVE"});
				return;
			}
			if (r_game.status == 2){ //Comprueba si la partida iniciada
				if (r_game.n_players-1 < g_object.minPlayers) { //Comprueba si al abandonar el jugador quedan menos del minimo permitido
					game.deleteGame(res.msg._id, game_id, function (res){
						if (res.status == "ERR") {
							callback(res);
							return;
						}
						callback({status: "DELETE_GAME"}); //Se borra la partida
					});
				} else {
					callback({status: "DELETE_PLAYER_STARTED"}); //No eres el ultimo, se te intenta borrar a ti
				}
			} else {
				game.db.remove('playersxgame', {player_id: game.db.getObjectId(res.msg._id)}, function (res){
					if (res.status == "ERR") {
						callback(res);
						return;
					}
					callback({status: "DELETE_PLAYER_NOT_STARTED"}); //Partida sin iniciar, se te borra
				});
			}
		});
	});
};

////////////METODOS PROPIOS///////////
//startRound: r_game, r_players, callback
method.startRound = function (r_game, r_players, msg_callback, callback) {
	var g_object = this;
	g_object.db.updateOne('games', {_id: r_game._id}, {currentblack: (parseInt(r_game.currentblack)+1)}, function () {
		g_object.db.findOne('bcardsxgame', {game_order: (parseInt(r_game.currentblack)+1), game_id: r_game._id}, function (bcard){
			if (!bcard){
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
							msg_callback(r_players[i].player_uid, bcard.card_text, buttonarray, cardstext);
					});
				})(i);
			}
			callback({status: "OK", data: {blackcard: bcard.card_text, game_type: r_game.type}});
		});
	});
};
//roundWinner: r_winner, r_game, callback
method.roundWinner = function (r_winner, r_game, callback) {
	var g_object = this;
	//Comprueba si se ha acabado la partida
	if (r_winner.points+1 >= r_game.n_cardstowin){
		//Devuelve el estado de OK y borra la partida
		g_object.deleteGame(r_game.creator_id, r_game._id, function (res){
			if (res.status == "ERR") {
				callback(res);
				return;
			}
			callback({status: "END_GAME"});
		});
	} else {
		//Actualiza los puntos del ganador de la ronda
		g_object.db.updateOne('playersxgame', {player_id: g_object.db.getObjectId(r_winner.player_id)}, {"points": (parseInt(r_winner.points)+1)}, function () {
			//Borra las cartas enviadas en la ronda actual
			g_object.db.remove('cardsxround', {game_id: g_object.db.getObjectId(r_game._id)}, function (){
				g_object.db.remove('votesxround', {game_id: g_object.db.getObjectId(r_game._id)}, function (){
					//Se realiza una accion diferente segun el tipo
					if (r_game.type == "dictadura" || r_game.type == "democracia"){
						callback({status: "OK", data: {game:r_game}});
					} else if (r_game.type=="clasico"){
						var president_order = parseInt(r_game.president_order);
						if (president_order+1 <= r_game.n_players) president_order = president_order+1;
						else president_order = 1;
						//Cambia el lider de la ronda
						g_object.db.findOne('playersxgame', {order: president_order, game_id: g_object.db.getObjectId(r_game._id)}, function (president_res){
							g_object.db.updateOne('games', {_id: g_object.db.getObjectId(r_game._id)}, {president_order: president_order, president_id: president_res.player_id}, function (up_res) {
								r_game.president_order = president_order;
								r_game.president_id = president_res.player_id;
								callback({status: "OK", data: {game:r_game}});
							});
						});
					} else callback({status: "ERR", msg: "ERR_UNEXPECTED_TYPE"});
				});
			});
		});
	}
};
//sendCard
method.sendCard = function (player_id, game_id, card_id, callback) {
	var g_object = this;
	g_object.db.findOne('playersxgame', {player_id: g_object.db.getObjectId(player_id), game_id: g_object.db.getObjectId(game_id)}, function(r_player){
		if (!r_player){
			callback({status: "ERR", msg: "ERR_USER_NO_GAME"});
			return;
		}
		g_object.db.findOne('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
			if (!r_game) {
				callback({status: "ERR", msg: "ERR_GAME_DELETED"});
				return;
			}
			if (r_game.status != 1){
				callback({status: "ERR", msg: "ERR_GAME_NOT_STARTED"});
				return;
			}
			g_object.db.count('cardsxround', {player_id: g_object.db.getObjectId(player_id)}, function(w_sent){
				if (w_sent){
					callback({status: "ERR", msg: "ERR_USER_ALREADY_RESPONSED"});
					return;
				}
				if ((r_game.type=="dictadura" && r_game.creator_id == player_id) || (r_game.type=="clasico" && r_game.dictator_uid == player_id)){
					callback({status: "ERR", msg: "ERR_DICTATOR_NOT_ALLOWED"});
					return;
				}
				g_object.db.count('cardsxround', {game_id: g_object.db.getObjectId(game_id)}, function(n_cards){
					if (n_cards >= r_game.n_players){
						callback({status: "ERR", msg: "ERR_ALL_ALREADY_RESPONSED"});
						return;
					}
					g_object.db.findOne('wcardsxgame', {_id: g_object.db.getObjectId(card_id), used: 0}, function(r_card) {
						if (!r_card) {
							callback({status: "ERR", msg: "ERR_CARD_ALREADY_USED"});
							return;
						}
						g_object.db.findOne('bcardsxgame', {game_order: (parseInt(r_game.currentblack)), game_id: g_object.db.getObjectId(game_id)}, function (bcard){
							if (!bcard){
								callback({status: "ERR", msg: "ERR_UNEXPECTED_BCARD"});
								return;
							}
							g_object.db.insertOne('cardsxround', {card_id: g_object.db.getObjectId(card_id), card_text: r_card.card_text, game_id: g_object.db.getObjectId(game_id), player_id: g_object.db.getObjectId(player_id), player_uid: r_player.player_uid, votes: 0}, function(){
								g_object.db.updateOne('wcardsxgame', {_id: g_object.db.getObjectId(card_id), game_id: g_object.db.getObjectId(game_id), player_id: r_player.player_id}, {used:1}, function (){
									//Si no eres el ultimo en votar
									if ((r_game.type=="dictadura" && n_cards+1 < r_game.n_players-1) || 
										(r_game.type=="clasico" && n_cards+1 < r_game.n_players-1) || 
										(r_game.type=="democracia" && n_cards+1 < r_game.n_players)){
											callback({status: "OK", data: {status: "NORMAL", wcard_text: r_card.card_text, blackcard: bcard.card_text}});
										}
									else if ((r_game.type=="dictadura" && n_cards+1 == r_game.n_players-1) || 
										(r_game.type=="clasico" && n_cards+1 == r_game.n_players-1) || 
										(r_game.type=="democracia" && n_cards+1 == r_game.n_players)) //Si eres el ultimo en votar
									{
										var textgroup = "";
										var array = [];
										//Creamos el array con los votos
										g_object.db.findMany('cardsxround', {game_id: g_object.db.getObjectId(game_id)}, function(r_cards){
											for (i = 0; i<r_cards.length; i++){
												textgroup += (i+1)+". "+r_cards[i].card_text+"\n";
												array.push({"id": r_cards[i].card_id, "text": r_cards[i].card_text});
											}
											if (r_game.type == "dictadura" || r_game.type == "clasico"){//Dictadura solo vota el lider
												g_object.db.findOne('playersxgame', {player_id: g_object.db.getObjectId(r_game.president_id), game_id: g_object.db.getObjectId(game_id)}, function(dictator){
													if (!dictator) {
														callback({status: "ERR", msg: "ERR_DICTATOR"});
														return;
													}
													callback({status: "OK", data: {status: "END", wcard_text: r_card.card_text, card_array: array, card_string: textgroup, game_type: r_game.type, room_id: r_game.room_id, blackcard: bcard.card_text, player_id: dictator.player_uid}});
												});
											} else if (r_game.type == "democracia"){//Democracia votan todos
												var player_ids = [];
												for (i = 0; i<r_cards.length; i++){
													player_ids.push(r_cards[i].player_uid);
												}
												callback({status: "OK", data: {status: "END", wcard_text: r_card.card_text, card_array: array, card_string: textgroup, game_type: r_game.type, room_id: r_game.room_id, blackcard: bcard.card_text, player_id: player_ids}});
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
	g_object.db.findOne('playersxgame', {player_id: g_object.db.getObjectId(player_id), game_id: g_object.db.getObjectId(game_id)}, function(r_player){
		if (!r_player){
			callback({status: "ERR", msg: "ERR_USER_NO_GAME"});
			return;
		}
		g_object.db.findOne('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
			if (!r_game) {
				callback({status: "ERR", msg: "ERR_GAME_DELETED"});
				return;
			}
			if (r_game.status != 1){
				callback({status: "ERR", msg: "ERR_GAME_NOT_STARTED"});
				return;
			}
			g_object.db.count('cardsxround', {game_id: g_object.db.getObjectId(game_id)}, function(n_cards){
				if (n_cards < r_game.n_players-1){
					callback({status: "ERR", msg: "ERR_ALL_NOT_ALREADY_RESPONSED"});
					return;
				}
				g_object.db.findOne('cardsxround', {card_id: g_object.db.getObjectId(card_id), game_id: g_object.db.getObjectId(game_id)}, function (r_card){
					if (!r_card){
						callback({status: "ERR", msg: "ERR_CARD_NOT_FOUND"});
						return;
					}
					g_object.db.findMany('playersxgame', {game_id: g_object.db.getObjectId(game_id)}, function(r_players){
						if (!r_players.length){
							callback({status: "ERR", msg: "ERR_UNEXPECTED_PLAYERS"});
							return;
						}
						if (r_game.type=="dictadura" || r_game.type=="clasico"){
							if (r_game.president_id.toString() != r_player.player_id.toString()){
								callback({status: "ERR", msg: "ERR_DICTATOR_ONLY_ALLOWED"});
								return;
							}
							g_object.db.findOne('playersxgame', {player_id: g_object.db.getObjectId(r_card.player_id)}, function(player){
								if (!player){
									callback({status: "ERR", msg: "ERR_UNEXPECTED_PLAY"});
									return;
								}
								callback({status: "OK", data: {game: r_game, player: player, cards: r_card, vote: r_card, players: r_players}});
							});
						} else if (r_game.type="democracia"){
							g_object.db.insertOne('votesxround', {player_id: g_object.db.getObjectId(player_id), card_id: g_object.db.getObjectId(card_id), game_id: g_object.db.getObjectId(game_id)}, function (){
								g_object.db.count('votesxround', {game_id: g_object.db.getObjectId(game_id)}, function (count_res){
									if (count_res == r_game.n_players){
										g_object.db.getMax('votesxround', 'card_id', {game_id: g_object.db.getObjectId(game_id)}, function (win_card){
											if (!win_card){
												callback({status: "ERR", msg: "ERR_UNEXPECTED_DEMOCRACY_CARD"});
												return;
											}
											g_object.db.findOne('cardsxround', {card_id: win_card._id, game_id: g_object.db.getObjectId(game_id)}, function (card){
												g_object.db.findOne('playersxgame', {player_id: card.player_id, game_id: g_object.db.getObjectId(game_id)}, function(player){
													if (!player){
														callback({status: "ERR", msg: "ERR_UNEXPECTED_DEMOCRACY"});
														return;
													}
													callback({status: "OK", data: {game: r_game, player: player, cards: card, vote: r_card, players: r_players}});
												});
											});
										});
									} else {
										callback({status: "VOTED", data: {vote: r_card}}); 
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
//checkCards: game_id, callback
method.checkCards = function (game_id, callback){
	var g_object = this;
	//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
	g_object.db.findOne('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
		if (!r_game) {
			callback({status: "ERR", msg: "ERR_NO_ACTIVE_GAMES"});
			return;
		}
		if (parseInt(r_game.status != 1)){
			callback({status: "ERR", msg: "ERR_GAME_NOT_STARTED"});
			return;
		}
		g_object.db.findMany('playersxgame', {game_id: g_object.db.getObjectId(game_id)}, function(r_players){
			g_object.db.findMany('cardsxround', {game_id: g_object.db.getObjectId(game_id)}, function (r_cards){
				if (r_players.length == r_cards.length){
					callback({status: "ERR", msg: "ERR_USER_ALREADY_RESPONSED"});
					return;
				}
				var players = [];
				for (i = 0; i < r_players.length; i++){
					var exists = false;
					for (j = 0; j < r_cards.length; j++){
						if (r_players[i].player_id.toString() == r_cards[j].player_id.toString()) {
							if (r_game.type == "democracia") exists = true;
							else if (r_players[i].order != r_game.president_id) exists = true;
						}
					}
					if (!exists) players.push(r_players[i]);
				}
				callback({status: "OK", data: {players: players}});
			});
		});
	});
};
//checkVotes: game_id, callback
method.checkVotes = function (game_id, callback){
	var g_object = this;
	//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
	g_object.db.findOne('games', {_id: g_object.db.getObjectId(game_id)}, function(r_game) {
		if (!r_game) {
			callback({status: "ERR", msg: "ERR_NO_ACTIVE_GAMES"});
			return;
		}
		if (parseInt(r_game.status != 1)){
			callback({status: "ERR", msg: "ERR_GAME_NOT_STARTED"});
			return;
		}
		g_object.db.findMany('playersxgame', {game_id: g_object.db.getObjectId(game_id)}, function(r_players){
			g_object.db.findMany('cardsxround', {game_id: g_object.db.getObjectId(game_id)}, function (r_cards){
				g_object.db.findMany('votesxround', {game_id: g_object.db.getObjectId(game_id)}, function (r_votes){
					if (r_players.length != r_cards.length){
						callback({status: "ERR", msg: "ERR_CARDS_UNSENT"});
						return;
					}
					if (r_players.length == r_votes.length){
						callback({status: "ERR", msg: "ERR_USER_ALREADY_VOTED"});
						return;
					}
					var players = [];
					for (i = 0; i < r_players.length; i++){
						var exists = false;
						for (j = 0; j < r_votes.length ;j++){
							if (r_players[i].player_id.toString() == r_votes[j].player_id.toString()) {
								if (r_game.type == "democracia") exists = true;
								else if (r_players[i].order != r_game.president_id) exists = true;
							}
						}
						if (!exists) players.push(r_players[i]);
					}
					callback({status: "OK", data: {players: players}});
				});
			});
		});
	});
};

//Export the game
module.exports = Game;
//ToDo: menos spam usando el editar mensaje de la API2.0
//Cargamos los modulos necesarios y las bases de datos de cartas
var TelegramBot = require('node-telegram-bot-api');
var privatedata = require('./privatedata');
var Cclhbot = require('./game');
var emoji = require('node-emoji').emoji;

//Iniciamos el bot y mongodb
var bot = new TelegramBot(privatedata.token, {polling: true});

//Iniciamos el Bot
var game = new Cclhbot(privatedata.url, function (res){
	if (res.status == "ERR") {
		console.error('No se ha podido conectar a la base de datos');
		return;
	}
	//////////////////////////////EVENTOS//////////////////////////////
	//Si el comando es /create y sus parametros son:
	//tipo_de_partida-> (dictadura|clasico|democracia)
	//numero_de_players-> ([2-9])
	//numero_de_rondas-> ([1-5])
	bot.onText(/^\/create(?:@cclhbot)?\s(dictadura|clasico|democracia)\s([2-9])\s([1-9])(?:\s(.*))?/, function (msg, match) {	
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type == "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
			return;
		}
		var name = game.getUsername(msg);
		game.createGame({room_id: msg.chat.id, from_id: msg.from.id, from_name: name, type: match[1], n_players: match[2], n_cardstowin: match[3], dictionary: match[4]}, function (res){
			//Capturamos errores
			if (res.status == "ERR") {
				switch (res.msg) {
					case "ERR_ACTIVE_GAME":
						bot.sendMessage(msg.chat.id, "Este grupo ya tiene una partida activa, su creador puede borrarla con /delete");
					break;
					case "ERR_ALREADY_IN_GAME":
						bot.sendMessage(msg.chat.id, "Ya estas participando en otra partida.");
					break;
					default:
						bot.sendMessage(msg.chat.id, "Error inesperado.");
						console.log(res);
					break;
				}
				return;
			}
			//Enviamos mensaje de confirmacion del diccionario
			if (res.data.dictionary_status != "DICTIONARY_OK")
				bot.sendMessage(msg.chat.id, "Lo siento, ese diccionario no existe o esta incompleto, utilizando el diccionario 'clasico' en su lugar...");
					
			//Se envia la informacion al grupo.
			bot.sendMessage(msg.chat.id, "Se ha creado la sala usando el diccionario '"+res.data.dictionary+"', ahora escribeme por privado (a @cclhbot) lo siguiente:");
			//Y se añade al jugador que creó la partida
			setTimeout(function(){
				bot.sendMessage(msg.chat.id, "/join "+res.data.game_id);
				game.joinGame({game_id: res.data.game_id, user_id: msg.from.id, username: name}, function (){
					//Y se le notifica por privado
					bot.sendMessage(msg.from.id, "Te has unido a la partida.");
					setTimeout(function(){bot.sendMessage(msg.chat.id, name+" se ha unido a la partida.");}, 550);
				});
			}, 300);
		});
	});
	//Si el comando es /join
	bot.onText(/^\/join(?:@cclhbot)?\s(.*)/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por privado
		if (msg.chat.type != "private") {
			bot.sendMessage(msg.chat.id, "Por favor enviame este comando por privado.");
			return;
		}
		//Obtenemos el nombre de usuario del creador
		var name = game.getUsername(msg);
		game.joinGame({game_id: match[1], user_id: msg.from.id, username: name}, function (res){
			//Capturamos errores
			if (res.status == "ERR") {
				switch (res.msg) {
					case "ERR_UNKNOWN_GAME":
						bot.sendMessage(msg.chat.id, "La partida especificada no existe.");
					break;
					case "ERR_ALREADY_STARTED":
						bot.sendMessage(msg.chat.id, "Ya se ha iniciado la partida.");
					break;
					case "ERR_ALREADY_FILLED":
						bot.sendMessage(msg.chat.id, "La partida esta llena, no puedes unirte.");
					break;
					case "ERR_ALREADY_IN_GAME":
						bot.sendMessage(msg.chat.id, "Ya estas participando en otra partida.");
					break;
					default:
						bot.sendMessage(msg.chat.id, "Error inesperado.");
						console.log(res);
					break;
				}
				return;
			}
			//Y se le notifica por privado
			bot.sendMessage(msg.chat.id, "Te has unido a la partida.");
			setTimeout(function(){bot.sendMessage(res.data.room_id, name+" se ha unido a la partida");}, 550);
		});
	});
	//Si el comando es /startgame
	bot.onText(/^\/startgame(?:@cclhbot)?/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type == "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
			return;
		}
		//Iniciamos la partida
		game.startGame(msg.from.id, msg.chat.id, function (res){
			//Capturamos errores
			if (res.status == "ERR") {
				switch (res.msg) {
					case "ERR_NO_ACTIVE_GAMES":
						bot.sendMessage(msg.chat.id, "Este grupo no tiene partidas activas.");
					break;
					case "ERR_NOT_CREATOR_START":
						bot.sendMessage(msg.chat.id, "Solo el creador "+res.extra.creator_name+" puede iniciar la partida.");
					break;
					case "ERR_ALREADY_STARTED":
						bot.sendMessage(msg.chat.id, "La partida ya esta iniciada.");
					break;
					case "ERR_NOT_ENOUGHT_PLAYERS":
						bot.sendMessage(msg.chat.id, "Aun no se ha llenado la partida. "+res.extra.current_players+" de "+res.extra.max_players+" participantes");
					break;
					default:
						bot.sendMessage(msg.chat.id, "Error inesperado.");
						console.log(res);
					break;
				}
				return;
			}
			//Iniciamos la primera ronda
			game.startRound(res.data.game, res.data.players, function (user_id, blackcard, cards_array, cards_string){
				if (res.status == "ERR") {
					bot.sendMessage(msg.chat.id, "Error inesperado.");
					console.log(res);
					return;
				}
				//Enviamos la cartas a cada jugador
				var opts = {
					reply_markup: JSON.stringify({
						keyboard: cards_array,
						one_time_keyboard: true
					})
				};
				bot.sendMessage(user_id, blackcard+"\nElige una opcion:\n"+cards_string, opts);
			}, function (r_res){
				//Enviamos la carta y el lider por el grupo
				if (r_res.status == "ERR") {
					bot.sendMessage(msg.chat.id, "Error inesperado.");
					console.log(res);
					return;
				}
				bot.sendMessage(msg.chat.id, "La carta negra de esta ronda es: \n"+r_res.data.blackcard);
				if (r_res.data.game_type == "clasico") {
					bot.sendMessage(r_res.data.dictator_id, "Eres el lider de esta ronda.");
					bot.sendMessage(msg.chat.id, "El lider de esta ronda es: "+r_res.data.dictator_name);
				}
			});
		});
	});
	//Si es una carta
	bot.onText(/^\/([0-9]+)\s(.*)/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por privado
		if (msg.chat.type != "private") {
			bot.sendMessage(msg.chat.id, "Por favor enviame este comando por privado.");
			return;
		}
		game.sendCard(msg.from.id, match[1], match[2], function (res){
			//Capturamos errores
			if (res.status == "ERR") {
				switch (res.msg) {
					case "ERR_USER_NO_GAME":
						bot.sendMessage(msg.chat.id, "No estas jugando ninguna partida.");
					break;
					case "ERR_GAME_DELETED":
						bot.sendMessage(msg.chat.id, "La partida que estabas jugando ya no existe.");
					break;
					case "ERR_GAME_NOT_STARTED":
						bot.sendMessage(msg.chat.id, "La partida aun no se ha iniciado.");
					break;
					case "ERR_ALL_ALREADY_RESPONSED":
						bot.sendMessage(msg.chat.id, "Ya ha respondido todo el mundo.");
					break;
					case "ERR_USER_ALREADY_RESPONSED":
						bot.sendMessage(msg.chat.id, "Ya has respondido en esta ronda");
					break;
					case "ERR_DICTATOR_NOT_ALLOWED":
						bot.sendMessage(msg.chat.id, "El dictador no puede elegir carta.");
					break;
					default:
						bot.sendMessage(msg.chat.id, "Error inesperado.");
						console.log(res);
					break;
				}
				return;
			}
			if (res.data.status == "NORMAL"){
				var opts = {
					reply_markup: JSON.stringify({
						hide_keyboard: true
					})
				};
				bot.sendMessage(msg.chat.id, "Has elegido: "+match[2], opts);
			} else {
				bot.sendMessage(msg.chat.id, "Has elegido: "+match[2], opts);
				var opts2 = {
					reply_markup: JSON.stringify({
						keyboard: res.data.card_array,
						one_time_keyboard: true
					})
				};
				//Segun el tipo de partida hace una cosa u otra
				if (res.data.game_type == "dictadura"){//Dictadura solo vota el lider
					res.data.card_string = res.data.blackcard+"\nEstas son las opciones, el lider votara por privado: \n"+res.data.card_string;
					bot.sendMessage(res.data.user_id, res.data.blackcard+"\nDebes votar una de estas opciones: ", opts2);
				} else if (res.data.game_type == "clasico") {//Clasico solo vota el lider de esa ronda
					res.data.card_string = res.data.blackcard+"\nEstas son las opciones, el lider de esta ronda votara por privado: \n"+res.data.card_string;
					bot.sendMessage(res.data.user_id, res.data.blackcard+"\nDebes votar una de estas opciones: ", opts2);
				} else if (res.data.game_type == "democracia"){//Democracia votan todos
					res.data.card_string = res.data.blackcard+"\nAhora podeis votar por privado entre las siguientes cartas: \n"+res.data.card_string;
					for (i = 0; i<res.data.user_id.length; i++){
						bot.sendMessage(res.data.user_id[i], res.data.blackcard+"\nDebes votar una de estas opciones: ", opts2);
					}
				} else bot.sendMessage(msg.chat.id, "Ha ocurrido un error inesperado.");
				bot.sendMessage(res.data.room_id, res.data.card_string);
			}
		});
	});
	//Si el comando es /vote
	bot.onText(/^\/vote\_([0-9]+)\s(.*)/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por privado
		if (msg.chat.type != "private") {
			bot.sendMessage(msg.chat.id, "Por favor enviame este comando por privado.");
			return;
		}
		game.sendVote(msg.from.id, match[1], function (res){
			//Capturamos errores
			if (res.status == "ERR") {
				switch (res.msg) {
					case "ERR_USER_NO_GAME":
						bot.sendMessage(msg.chat.id, "No estas jugando ninguna partida.");
					break;
					case "ERR_GAME_DELETED":
						bot.sendMessage(msg.chat.id, "La partida que estabas jugando ya no existe.");
					break;
					case "ERR_GAME_NOT_STARTED":
						bot.sendMessage(msg.chat.id, "La partida aun no se ha iniciado.");
					break;
					case "ERR_ALL_NOT_ALREADY_RESPONSED":
						bot.sendMessage(msg.chat.id, "Aun no han enviado carta todos los jugadores.");
					break;
					case "ERR_CARD_NOT_FOUND":
						bot.sendMessage(msg.chat.id, "La carta votada no existe.");
					break;
					case "ERR_DICTATOR_NOT_ALLOWED":
						bot.sendMessage(msg.chat.id, "El dictador no puede elegir carta.");
					break;
					default:
						bot.sendMessage(msg.chat.id, "Error inesperado.");
						console.log(res);
					break;
				}
				return;
			}
			var opts = {   
				reply_markup: JSON.stringify({
					hide_keyboard: true
				})
			};
			bot.sendMessage(msg.chat.id, "Has votado: "+match[2], opts);
			if (res.status != "VOTED") {
				bot.sendMessage(res.data.player.user_id, "Has ganado la ronda con tu carta: \n"+res.data.cards.card_text+"\nTienes "+(res.data.player.points+1)+" puntos.");
				bot.sendMessage(res.data.game.room_id, res.data.player.username+" ha ganado la ronda con su carta: \n"+res.data.cards.card_text+"\nTiene "+(res.data.player.points+1)+" puntos.");
			
				game.roundWinner(res.data.player, res.data.game, res.data.game.room_id, function (resp) {
					if (resp.status == "ERR") {
						bot.sendMessage(msg.chat.id, "Error inesperado.");
						console.log(res);
						return;
					}
					setTimeout(function(){
						bot.sendMessage(res.data.player.user_id, emoji.confetti_ball+" Has ganado la partida!! "+emoji.confetti_ball);
						bot.sendMessage(res.data.game.room_id, res.data.player.username+" ha ganado la partida!! "+emoji.confetti_ball+" "+emoji.confetti_ball);
					}, 300);
				}, function (resp) {
					if (res.status == "ERR") {
						bot.sendMessage(msg.chat.id, "Error inesperado.");
						console.log(res);
						return;
					}
					//Iniciamos la primera ronda
					game.startRound(res.data.game, res.data.players, function (user_id, blackcard, cards_array, cards_string){
						//Enviamos la cartas a cada jugador
						var opts = {
							reply_markup: JSON.stringify({
								keyboard: cards_array,
								one_time_keyboard: true
							})
						};
						bot.sendMessage(user_id, blackcard+"\nElige una opcion:\n "+cards_string, opts);
					}, function (r_res){
						//Enviamos la carta y el lider por el grupo
						if (r_res.status == "ERR") {
							bot.sendMessage(msg.chat.id, "Error inesperado.");
							console.log(r_res);
							return;
						}
						setTimeout(function(){
							bot.sendMessage(res.data.game.room_id, "La carta negra de esta ronda es: \n"+r_res.data.blackcard);
							if (r_res.data.game_type == "clasico") {
								bot.sendMessage(r_res.data.dictator_id, "Eres el lider de esta ronda.");
								bot.sendMessage(r_res.data.room_id, "El lider de esta ronda es: "+r_res.data.dictator_name);
							}
						}, 300);
					});
				});
			}
		});
	});
	//Si el comando es /delete
	bot.onText(/^\/delete(?:@cclhbot)?/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type == "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
			return;
		}
		game.deleteGame(msg.from.id, msg.chat.id, function (res){
			//Capturamos errores
			if (res.status == "ERR") {
				switch (res.msg) {
					case "ERR_NO_ACTIVE_GAMES":
						bot.sendMessage(msg.chat.id, "Este grupo no tiene partidas activas..");
					break;
					case "ERR_CREATOR_DELETE":
						bot.sendMessage(msg.chat.id, "Solo el creador "+res.extra.creator_name+" puede borrar la partida.");
					break;
					default:
						bot.sendMessage(msg.chat.id, "Error inesperado.");
						console.log(res);
					break;
				}
				return;
			}
			bot.sendMessage(msg.chat.id, "Se ha borrado la partida.");
		});
	});
	//Si el comando es /checkvotes
	bot.onText(/^\/checkvotes(?:@cclhbot)?/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type == "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
			return;
		}
		//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
		game.db.find('games', {room_id: msg.chat.id}, function(r_game) {
			if (!r_game.length) {
				bot.sendMessage(msg.chat.id, "Este grupo no tiene partidas activas.");
				return;
			}
			if (!parseInt(r_game[0].currentblack)){
				bot.sendMessage(msg.chat.id, "La partida aun no esta iniciada.");
				return;
			}
			game.db.count('cardsxround', {game_id: r_game[0].game_id}, function (count_cards){
				if (count_cards != r_game[0].n_players){
					bot.sendMessage(msg.chat.id, "Aun no han elegido carta todos los jugadores.");
					return;
				}
				game.db.sumax('cardsxround', 'votes', {game_id: r_game[0].game_id}, function(sum) {
					//ToDo?: ver quien falta por votar
					bot.sendMessage(msg.chat.id, "Han votado "+sum[0].sum+" jugadores de "+r_game[0].n_players);
				});
			});
		});
	});
	//Si el comando es /checkplayers
	bot.onText(/^\/checkplayers(?:@cclhbot)?/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type == "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
			return;
		}
		//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
		game.db.find('games', {room_id: msg.chat.id}, function(r_game) {
			if (!r_game.length) {
				bot.sendMessage(msg.chat.id, "Este grupo no tiene partidas activas.");
				return;
			}
			if (!parseInt(r_game[0].currentblack)){
				bot.sendMessage(msg.chat.id, "La partida aun no esta iniciada.");
				return;
			}
			game.db.find('players', {game_id: r_game[0].game_id}, function(r_players){
				game.db.find('cardsxround', {game_id: r_game[0].game_id}, function (r_cards){
					if (r_players.length == r_cards.length){
						bot.sendMessage(msg.chat.id, "Todo el mundo ha elegido carta.");
						return;
					}
					var texto = "";
					for (i=0; i<r_players.length;i++){
						existe = false;
						for (j=0; j<r_cards.length;j++){
							if (r_players[i].user_id == r_cards[j].user_id) existe = true;
						}
						if (!existe) texto += r_players[i].username+"\n";
					}
					bot.sendMessage(msg.chat.id, "Aun no han elegido carta: \n"+texto);
				});
			});
		});
	});
	//Si el comando es /votedelete
	bot.onText(/^\/votedelete(?:@cclhbot)?/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type == "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
			return;
		}
		//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
		game.db.find('games', {room_id: msg.chat.id}, function(r_game) {
			if (!r_game.length) {
				bot.sendMessage(msg.chat.id, "Este grupo no tiene partidas activas.");
				return;
			}
			game.db.find('players', {user_id: msg.from.id, game_id: r_game[0].game_id}, function(r_players){
				if (!r_players.length){
					bot.sendMessage(msg.chat.id, "No eres miembro de esta partida.");
					return;
				}
				if (parseInt(r_players[0].vote_delete) != 0){
					bot.sendMessage(msg.chat.id, "Ya has votado para eliminar la partida.");
					return;
				}
				if ((parseInt(r_game[0].vote_delete)+1) < (r_game[0].n_players/2)){ //ToDo?: usar los jugadores que hay en lugar del total
					game.db.update('games', {game_id: r_game[0].game_id}, {"vote_delete": (parseInt(r_game[0].vote_delete)+1)}, function (){
						game.db.update('players', {user_id: msg.from.id}, {"vote_delete": 1}, function (){
							bot.sendMessage(msg.chat.id, "Has votado para eliminar la partida. Deben votar al menos la mitad de los participantes.");
						});
					});
				} else {
					//Borrar la partida
					game.deleteGame(r_game[0].game_id, msg.chat.id, function (){
						bot.sendMessage(msg.chat.id, "Se ha borrado la partida.");
					});
				}
			});
		});
	});
	//ToDo: enviar leave por priv como join?, arreglar una vez esta la partida empezada
	bot.onText(/^\/leave(?:@cclhbot)?/i, function (msg, match) {
		if (msg.chat.type == "private") {
			bot.sendMessage(msg.chat.id, "Por favor enviame este comando por un grupo.");
			return;
		}
		game.db.find('games', {room_id: msg.chat.id}, function(r_game) {
			if (!r_game.length) {
				bot.sendMessage(msg.chat.id, "El grupo indicado no existe.");
				return;
			}
			game.db.find('players', {user_id: msg.from.id, game_id: r_game[0].game_id}, function(r_player){
				if (!r_player.length){
					bot.sendMessage(msg.chat.id, "No estas jugando esta partida.");
					return;
				}
				if (r_game[0].creator_id == msg.from.id){
					bot.sendMessage(msg.chat.id, "Lo sentimos, el creador no puede dejar la partida.");
					return;
				}
				if ((r_game[0].type == "clasico" && r_player[0].player_id != r_game[0].dictator_id) || r_game[0].type != "clasico"){
					game.db.count('cardsxround', {user_id: msg.from.id, game_id: r_game[0].game_id}, function(r_players){
						if (r_players){
							bot.sendMessage(msg.chat.id, "Lo sentimos, no puedes abandonar si ya has enviado carta este turno.");
							return;
						}
						if (r_game[0].currentblack != 0){ //Partida iniciada
							if (r_game[0].n_players-1 < 2){
								bot.sendMessage(msg.chat.id, r_player[0].username+" ha abandonado la partida.");
								//Borrar la partida
								game.deleteGameData(r_game[0].game_id, msg.chat.id, function (){
									bot.sendMessage(msg.chat.id, "Se ha borrado la partida.");
								});
							} else {
								game.db.find('cardsxround', {game_id: r_game[0].game_id}, function(n_cards){
									if (n_cards == r_game[0].n_players-1){
										game.db.update('games', {game_id: r_game[0].game_id}, { "n_players": (parseInt(r_game[0].n_players)-1)}, function (){
											game.db.remove('players', {user_id: msg.from.id}, function (){
												bot.sendMessage(msg.chat.id, r_player[0].username+" ha abandonado la partida.");
											});
										});
									} else bot.sendMessage(msg.chat.id, "Lo sentimos, no puedes abandonar si solo quedas tu por elegir carta. Intentalo mas tarde.");
								});
							}
						} else { //Partida sin iniciar
							game.db.remove('players', {user_id: msg.from.id}, function (){
								bot.sendMessage(msg.chat.id, r_player[0].username+" ha abandonado la partida.");
							});
						}
					});
				} else bot.sendMessage(msg.chat.id, "Lo sentimos, el dictador no puede dejar la partida.");
			});
		});
	});
	//Si el comando es /newdictionary
	//ToDo: poder añadir colaboradores
	bot.onText(/^\/newdictionary(?:@cclhbot)?\s(.*)/i, function (msg, match) { 
		//Detectamos si el mensaje recibido es por privado
		if (msg.chat.type != "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por privado.");
			return;
		}
		//Buscamos en la tabla diccionarios si creador ya tiene una
		game.db.count('dictionaries', {creator_id: msg.from.id}, msg.chat.id, function(r_dic) {
			if (r_dic) {
				bot.sendMessage(msg.chat.id, "Lo sentimos, por el momento un usuario solo puede crear un diccionario.");
				return;
			}
			//Buscamos en la tabla diccionarios si el nombre ya existe.
			game.db.count('dictionaries', {name: match[1]}, msg.chat.id, function(n_dic) {
				if (n_dic) {
					bot.sendMessage(msg.chat.id, "Lo sentimos, ya existe un diccionario con ese nombre.");
					return;
				}
				//Obtenemos el nombre de usuario del creador
				var name = game.getUsername(msg);
				//Añadimos el diccionario a la BD
				game.db.insert('dictionaries', {creator_id: msg.from.id, creator_name: name, name: match[1], valid: 0}, msg.chat.id, function(){
					//Y se le notifica por privado
					bot.sendMessage(msg.from.id, "Se ha creado el diccionario, ahora procede a añadir cartas con /addblackcard y /addwhitecard.");
				});
			});
		});
	});
	//Si el comando es /addblackcard
	bot.onText(/^\/addblackcard(?:@cclhbot)?\s(.*)/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por privado
		if (msg.chat.type != "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por privado.");
			return;
		}
		//Buscamos en la tabla diccionarios si el nombre ya existe.
		game.db.find('dictionaries', {creator_id: msg.from.id}, msg.chat.id, function(r_dic) {
			if (!r_dic.length) {
				bot.sendMessage(msg.chat.id, "Debes crear primero un diccionario.");
				return;
			}
			//Buscamos en la tabla diccionarios si el nombre ya existe.
			game.db.count('blackcards', {dictionary: r_dic[0].name}, msg.chat.id, function(n_dic) {
				//Si hay menos de 50 cartas
				if (n_dic >= 50) {
					bot.sendMessage(msg.chat.id, "Este diccionario ya esta completo.");
					return;
				}
				game.db.insert('blackcards', {card_text: match[1], dictionary: r_dic[0].name}, msg.chat.id, function(){
					//se le notifica por privado
					if ((n_dic + 1) < 50) bot.sendMessage(msg.from.id, "Se ha añadido la carta. Llevas "+(n_dic+1)+" de 50.");
					else {
						game.db.count('whitecards', {dictionary: r_dic[0].name}, msg.chat.id, function(wca) {
							if (wca != 405){
								bot.sendMessage(msg.chat.id, "Se ha completado el diccionario de cartas negras. Ahora completa el diccionario de blancas.");
								return;
							}
							game.db.update('dictionaries', {creator_id: msg.from.id}, { "valid": 1}, msg.chat.id, function (){
								bot.sendMessage(msg.from.id, "Diccionario completado, ya puedes jugar con el!");
							});
						});
					}
				});
			});
		});
	});
	//Si el comando es /addwhitecard
	bot.onText(/^\/addwhitecard(?:@cclhbot)?\s(.*)/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por privado
		if (msg.chat.type != "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por privado.");
			return;
		}
		//Buscamos en la tabla diccionarios si el nombre ya existe.
		game.db.find('dictionaries', {creator_id: msg.from.id}, function(r_dic) {
			if (!r_dic.length) {
				bot.sendMessage(msg.chat.id, "Debes crear primero un diccionario.");
				return;
			}
			//Buscamos en la tabla diccionarios si el nombre ya existe.
			game.db.count('whitecards', {dictionary: r_dic[0].name}, function(n_dic) {
				//Si hay menos de 405 cartas
				if (n_dic >= 405) {
					bot.sendMessage(msg.chat.id, "Este diccionario ya esta completo.");
					return;
				}
				game.db.insert('whitecards', {card_text: match[1], dictionary: r_dic[0].name}, function(){
					//se le notifica por privado
					if ((n_dic + 1) < 405) bot.sendMessage(msg.from.id, "Se ha añadido la carta. Llevas "+(n_dic+1)+" de 405.");
					else {
						game.db.count('blackcards', {dictionary: r_dic[0].name}, function(bca) {
							if (bca != 50){
								bot.sendMessage(msg.chat.id, "Se ha completado el diccionario de cartas blancas. Ahora completa el diccionario de negras.");
								return;
							}
							game.db.update('dictionaries', {creator_id: msg.from.id}, { "valid": 1}, function (){
								bot.sendMessage(msg.from.id, "Diccionario completado, ya puedes jugar con el!");
							});
						});
					}
				});
			});
		});
	});
	//Si el comando es /listdicionaries
	bot.onText(/^\/listdictionaries(?:@cclhbot)?/i, function (msg, match) {
		if (msg.chat.type == "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
			return;
		}
		//Buscamos en la tabla diccionarios
		game.db.find('dictionaries', {valid:1}, function(r_dic) {
			if (!r_dic.length) {
				bot.sendMessage(msg.chat.id, "No hay ningun diccionario.");
				return;
			}
			var texto = "";
			for (i=0; i< r_dic.length; i++){
				texto += r_dic[i].name+" de "+r_dic[i].creator_name+"\n";
			}
			bot.sendMessage(msg.chat.id, "Puedes usar cualquiera de estos diccionarios: \n"+texto);
		});
	});
	bot.onText(/^\/bot.sendMessage(?:@cclhbot)?\s(.*)/i, function (msg, match) {
		if (msg.chat.type == "private") {
			if (msg.chat.id == 5890303) {
				game.db.find('players', {}, function(r_pla) {
					if(r_pla.length){
						for (i=0; i<r_pla.length;i++){
							bot.sendMessage(r_pla[i].user_id, match[1]);
							bot.sendMessage(msg.chat.id, "Mensaje enviado a: "+r_pla[i].username);
						}
					} else bot.sendMessage(msg.chat.id, "No hay usuarios.");
				});
			} else bot.sendMessage(msg.chat.id, "Solo @themarioga puede usar este comando.");
		} else bot.sendMessage(msg.chat.id, "Por favor envia este comando por privado.");
	});
	//Si el comando es /version
	bot.onText(/^\/version(?:@cclhbot)?/i, function (msg, match) {
		bot.sendMessage(msg.chat.id, "Versión 0.6. Creado por @themarioga");
	});
	//Si el comando es /start
	bot.onText(/^\/start(?:@cclhbot)?$/i, function (msg, match) {
		bot.sendMessage(msg.chat.id, "Gracias por unirte al juego de Cartas contra la humanidad para telegram!\nUtiliza el comando /help para mas informacion.");
	});
	//Si el comando es /create
	bot.onText(/^\/create(?:@cclhbot)?$/i, function (msg, match) {
		bot.sendMessage(msg.chat.id, "Error en la sintaxis, consulta /help para mas informacion.");
	});
	//Si el comando es /join
	bot.onText(/^\/join(?:@cclhbot)?$/i, function (msg, match) {
		bot.sendMessage(msg.chat.id, "Error en la sintaxis, consulta /help para mas informacion.");
	});
	//Si el comando es /votedelete
	bot.onText(/^\/votedelete(?:@cclhbot)?$/i, function (msg, match) {
		bot.sendMessage(msg.chat.id, "Error en la sintaxis, consulta /help para mas informacion.");
	});
	//Si el comando es /newdictionary
	bot.onText(/^\/newdictionary(?:@cclhbot)?$/i, function (msg, match) {
		bot.sendMessage(msg.chat.id, "Error en la sintaxis, consulta /help para mas informacion.");
	});
	//Si el comando es /addblackcard
	bot.onText(/^\/addblackcard(?:@cclhbot)?$/i, function (msg, match) {
		bot.sendMessage(msg.chat.id, "Error en la sintaxis, consulta /help para mas informacion.");
	});
	//Si el comando es /addwhitecard 
	bot.onText(/^\/addwhitecard(?:@cclhbot)?$/i, function (msg, match) {
		bot.sendMessage(msg.chat.id, "Error en la sintaxis, consulta /help para mas informacion.");
	});
	//Si el comando es /help
	bot.onText(/^\/help(?:@cclhbot)?$/i, function (msg, match) {
		bot.sendMessage(msg.chat.id, 'Bienvenido a la ayuda del juego Cartas Contra la Humanidad, el bot para telegram.\n'+
		'Puedes ver de que trata, y como jugar aqui: http://cartascontralahumanidad.com/reglas/ \n'+
		'o un ejemplo practico en este video (en ingles): https://www.youtube.com/watch?v=sw3HXyICwAU \n'+
		'Para esta version en concreto (bot de telegram), el juego se realiza a traves de comandos, son los siguientes: \n'+
		'/create dictadura|clasico|democracia numero_de_jugadores numero_de_cartas_para_ganar [nombre_del_diccionario]\n'+
		'Este comando permite crear una partida, debe escribirse en un grupo, pueden jugar entre 2 y 9 jugadores, y puede haber entre 1 y 5 rondas, un ejemplo de como usarlo seria /create dictadura 5 4 \n'+
		'Una vez creada el bot nos pedira que nos unamos a la partida, para ello genera un codigo que debemos pasarle por privado (abriendo una conversacion privada con el), este comando es... \n'+
		'/join codigo_de_la_partida \n'+
		'Este comando nos permite unirnos a una partida ya creada, debe enviarse por privado, un ejemplo de uso seria /join xyz \n'+
		'Una vez se haya unido el numero de jugadores especificado en /create el creador puede iniciar la partida con el comando.../startgame \n'+
		'Este comando, escrito por un grupo inicia una partida en la que ya han entrado todos los jugadores, el bot elije una carta negra y reparte cartas blancas a los jugadores. Cuando todo el mundo haya recibido sus cartas por privado, puede proceder a votarlas haciendo click en los botones con opciones que aparecen. \n'+
		'Una vez que todos hayan elegido carta el lider votara por la opcion que mas le guste en caso de que sea dictadura (el creador vota siempre) o clasico (en cada ronda hay 1 dictador).\n'+
		'En caso de que sea democracia todos los jugadores podran votar a su opcion favorita y la mas votada ganara la ronda,en caso de empate se elegira aleatoriamente entre las mas votadas.\n'+
		'El ganador de la ronda recibira un punto.\n'+
		'Cuando los puntos de un jugador igualen el numero_de_cartas_para_ganar elegido en el el comando /create habra ganado la partida.\n'+
		'\n'+
		'/votedelete codigo_de_la_partida \n'+
		'Permite a los participantes votar para borrar la partida. Debes pasar el codigo de la partida por parametro (el mismo que el de join), para mayor seguridad. \n'+
		'/checkplayers \n'+
		'Devuelve los miembros que han enviado carta en esta ronda. \n'+
		'/checkvotes \n'+
		'Devuelve el numero de miembros que han votado en esta ronda. \n'+
		'\n'+
		'/leave \n'+
		'Abandona una partida, solo funciona cuando aun no has enviado carta y no eres el creador/dictador. \n'+
		'/newdictionary \n'+
		'Envia este comando por privado para crear un diccionario. \n'+
		'/addblackcard \n'+
		'Envia este comando por privado para añadir una carta negra a tu diccionario. \n'+
		'/addwhitecard \n'+
		'Envia este comando por privado para añadir una carta blanca a tu diccionario. \n'+
		'/listdictionaries \n'+
		'Envia este comando por un grupo para ver la lista de diccionarios. \n'+
		'\n'+
		'Disfrutad del bot y... ¡A jugar!');
	});
});
//Cargamos los modulos necesarios
var TelegramBot = require('node-telegram-bot-api');
var privatedata = require('./privatedata');
var GameBot = require('./game');
var emoji = require('node-emoji').emoji;

//Iniciamos el bot y mongodb
var bot = new TelegramBot(privatedata.token, {polling: true});

//Iniciamos el Bot
var game = new GameBot(privatedata.url, function (res){
	if (res.status == "ERR") {
		console.error('No se ha podido conectar a la base de datos');
		return;
	}
	//////////////////////////////EVENTOS//////////////////////////////
	//Si el comando es /start (por privado):
	bot.onText(new RegExp("^\\/start(?:@"+privatedata.botalias+")?", "i"), function (msg, match) {	
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type != "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por un privado.");
			return;
		}
		game.createUser({user_id: msg.from.id, username: game.getUsername(msg)}, function (res){
			if (res.status == "ERR") {
				switch (res.msg) {
					case "ERR_ALREADY_IN_GAME":
						bot.sendMessage(msg.chat.id, "Ya estas registrado en el juego.");
					break;
					default:
						bot.sendMessage(msg.chat.id, "Error inesperado.");
						console.log(res);
					break;
				}
				return;
			}
			bot.sendMessage(msg.from.id, "Cuenta creada. Utiliza el comando /create en un grupo para crear una partida o haz click en Unirse a la partida si ya hay una creada.");
		});
	});
	//Si el comando es /create y sus parametros son:
	//numero_de_players-> ([2-9])
	bot.onText(new RegExp("^\\/create(?:@"+privatedata.botalias+")?\\s(dictadura|clasico|democracia)\\s([2-9])\\s([1-9])(?:\\s(.*))?", "i"), function (msg, match) {	
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type == "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
			return;
		}
		game.getUser(msg.from.id, function (res){
			//Capturamos errores
			if (res.status == "ERR") {
				switch (res.msg) {
					case "ERR_NOT_IN_GAME":
						bot.sendMessage(msg.chat.id, "Debes hablar conmigo (@"+privatedata.botalias+") por privado y mandar el mensaje /start.");
					break;
					default:
						bot.sendMessage(msg.chat.id, "Error inesperado.");
						console.log(res);
					break;
				}
				return;
			}
			//Comprobamos que no este jugando
			if (res.playing){
				bot.sendMessage(msg.chat.id, "Ya estas participando en otra partida.");
				return;
			}
			//Comprobamos que el diccionario exista
			dictionary = match[4];
			if (typeof dictionary != "string" || dictionary == "") dictionary = "clasico";
			game.db.count('dictionaries', {name: dictionary, valid:1}, function(count_dict) {
				baddictionary = false;
				if (!count_dict) {
					dictionary = "clasico";
					baddictionary = true;
				}
				//Creamos la partida
				game.createGame({
					msg_id: msg.id,
					room_id: msg.chat.id,
					creator_id: res.msg._id,
					president_id: 0,
					currentblack: 0,
					n_players: match[2],
					type: match[1],
					n_cardstowin: match[3],
					dictionary: dictionary
				}, function (game_res){
					//Capturamos errores
					if (game_res.status == "ERR") {
						switch (game_res.msg) {
							case "ERR_ACTIVE_GAME":
								bot.sendMessage(msg.chat.id, "Este grupo ya tiene una partida activa, su creador debe borrarla antes de crear otra.");
							break;
							default:
								bot.sendMessage(msg.chat.id, "Error inesperado.");
								console.log(game_res);
							break;
						}
						return;
					}
					//Guardamos las cartas
					game.db.find('whitecards', {dictionary: dictionary}, function (array){
						array = game.shuffleArray(array).slice(0, parseInt(match[2])*45);
						newarray = [];
						for (i = 0; i < array.length; i++){
							newarray.push({card_text: array[i].card_text, game_id: game_res.msg.game_id, player_order: Math.round(i/45)+1, used: 0});
						}
						game.db.insertMany('wcardsxgame', newarray);
					});
					game.db.find('blackcards', {dictionary: dictionary}, function (array){
						array = game.shuffleArray(array).slice(0, parseInt(match[2])*45);
						newarray = [];
						for (i = 0; i < array.length; i++){
							newarray.push({card_text: array[i].card_text, game_id: game_res.msg.game_id, game_order: i});
						}
						game.db.insertMany('bcardsxgame', newarray);
					});
					//Creamos mensaje de confirmacion del diccionario
					if (baddictionary) dictionary_text = "Lo siento, ese diccionario no existe o esta incompleto. Se ha creado la sala utilizando el diccionario 'clasico' en su lugar.";
					else dictionary_text = "Se ha creado la sala utilizando el diccionario '"+dictionary+"'.";
					//Añadimos a la partida al usuario que la ha creado
					game.joinGame({
						game_id: game_res.msg.game_id,
						player_id: res.msg._id,
						player_uid: res.msg.user_id,
						player_username: res.msg.username, 
						points: 0, 
						vote_delete: 0
					}, function (player_res){
						//Capturamos errores
						if (player_res.status == "ERR") {
							switch (player_res.msg) {
								default:
									bot.sendMessage(msg.chat.id, "Error inesperado.");
									console.log(player_res);
								break;
							}
							return;
						}
						//Creamos el array de botones para gestionar el grupo
						var opts = {
							reply_markup: JSON.stringify({
								inline_keyboard: [
									[{text: "Unirse a la partida", callback_data: "join_"+game_res.msg.game_id}],
									[{text: "Borrar la partida", callback_data: "delete_"+game_res.msg.game_id}],
									[{text: "Iniciar la partida", callback_data: "start_"+game_res.msg.game_id}]
								]
							})
						};
						bot.sendMessage(msg.chat.id, dictionary_text+"\nParticipantes:\n"+res.msg.username, opts);
						bot.sendMessage(res.msg.user_id, "Te has unido a una partida.");
					});
				});
			});
		});
	});
	//Si recibimos una callbackQuery
	bot.on('callback_query', function (msg) {
		game.getUser(msg.from.id, function (res){
			//Capturamos errores
			if (res.status == "ERR") {
				switch (res.msg) {
					case "ERR_NOT_IN_GAME":
						bot.answerCallbackQuery(msg.id, "Debes hablar conmigo (@"+privatedata.botalias+") por privado y mandar el mensaje /start.");
					break;
					default:
						bot.answerCallbackQuery(msg.id, "Error inesperado.");
						console.log(res);
					break;
				}
				return;
			}
			var data = msg.data.split("_");
			if (data[0] == "join"){
				if (res.playing){
					bot.answerCallbackQuery(msg.id, "Ya estas participando en una partida.");
					return;
				}
				game.joinGame({
					game_id: game.db.getObjectId(data[1]),
					player_id: game.db.getObjectId(res.msg._id),
					player_uid: res.msg.user_id,
					player_username: res.msg.username, 
					points: 0, 
					vote_delete: 0
				}, function (join_res){
					//Capturamos errores
					if (join_res.status == "ERR") {
						switch (join_res.msg) {
							case "ERR_UNKNOWN_GAME":
								bot.answerCallbackQuery(msg.id, "Esta partida no existe.");
							break;
							case "ERR_ALREADY_STARTED":
								bot.answerCallbackQuery(msg.id, "Esta partida ya está iniciada.");
							break;
							case "ERR_ALREADY_FILLED":
								bot.answerCallbackQuery(msg.id, "La partida ya está llena.");
							break;
							default:
								bot.answerCallbackQuery(msg.id, "Error inesperado.");
								console.log(join_res);
							break;
						}
						return;
					}
					//ToDo: asignar extras al player 
					var opts = {
						chat_id: msg.message.chat.id, 
						message_id: msg.message.message_id,
						reply_markup: JSON.stringify({
							inline_keyboard: [
								[{text: "Unirse a la partida", callback_data: "join_"+data[1]}],
								[{text: "Borrar la partida", callback_data: "delete_"+data[1]}],
								[{text: "Iniciar la partida", callback_data: "start_"+data[1]}]
							]
						})
					};
					bot.editMessageText(msg.message.text+"\n"+res.msg.username, opts);
					bot.answerCallbackQuery(msg.id, 'Te has unido correctamente a la partida.');
					//Creamos el array de botones para gestionar el grupo
					var opts = {
						reply_markup: JSON.stringify({
							inline_keyboard: [
								[{text: "Dejar la partida", callback_data: "leave_"+data[1]}]
							]
						})
					};
					bot.sendMessage(res.msg.user_id, "Te has unido a una partida.", opts);
				});
			} else if (data[0] == "delete"){
				game.deleteGame(res.msg._id, data[1], function (res){
					//Capturamos errores
					if (res.status == "ERR") {
						switch (res.msg) {
							case "ERR_NO_ACTIVE_GAMES":
								bot.answerCallbackQuery(msg.id, "Esta partida ya está borrada.");
							break;
							case "ERR_CREATOR_DELETE":
								bot.answerCallbackQuery(msg.id, "Solo el creador puede borrar la partida.");
								//ToDo: vote delete?
							break;
							default:
								bot.answerCallbackQuery(msg.id, "Error inesperado.");
								console.log(res);
							break;
						}
						return;
					}
					game.db.remove('wcardsxgame', {game_id: game.db.getObjectId(data[1])});
					game.db.remove('bcardsxgame', {game_id: game.db.getObjectId(data[1])});
					game.db.remove('cardsxround', {game_id: game.db.getObjectId(data[1])});
					bot.editMessageText("Partida borrada", {chat_id: msg.message.chat.id, message_id: msg.message.message_id});
					bot.answerCallbackQuery(msg.id,  "Se ha borrado la partida.");
				});
			} else if (data[0] == "start"){
				game.startGame(res.msg._id, data[1], msg.message.message_id, function (g_res){ 
					//Capturamos errores
					if (g_res.status == "ERR") {
						switch (g_res.msg) {
							case "ERR_NO_ACTIVE_GAMES":
								bot.answerCallbackQuery(msg.id, "Este grupo no tiene partidas activas.");
							break;
							case "ERR_NOT_CREATOR_START":
								bot.answerCallbackQuery(msg.id, "Solo el creador puede iniciar la partida.");
							break;
							case "ERR_ALREADY_STARTED":
								bot.answerCallbackQuery(msg.id, "La partida ya esta iniciada.");
							break;
							case "ERR_NOT_ENOUGHT_PLAYERS":
								bot.answerCallbackQuery(msg.id, "Aun no se ha llenado la partida. "+g_res.extra.current_players+" de "+g_res.extra.max_players+" participantes");
							break;
							default:
								bot.answerCallbackQuery(msg.id, "Error inesperado.");
								console.log(g_res);
							break;
						}
						return;
					}
					var opts = {
						chat_id: msg.message.chat.id, 
						message_id: msg.message.message_id,
						reply_markup: JSON.stringify({
							inline_keyboard: [
								[{text: "Borrar la partida", callback_data: "delete_"+data[1]}],
								[{text: "Consultar cartas", callback_data: "checkcards_"+data[1]}],
								[{text: "Consultar votos", callback_data: "checkvotes_"+data[1]}]
							]
						})
					};
					bot.editMessageText(msg.message.text, opts);
					//Iniciamos la primera ronda
					game.startRound(g_res.data.game, g_res.data.players, function (user_id, blackcard, cards_array, cards_string){
						var optsarray = [];
						for (var card of cards_array){
							optsarray.push([{text: card.text, callback_data: "card_"+data[1]+"_"+card.id}]);
						}
						//Enviamos la cartas a cada jugador
						var opts = {
							reply_markup: JSON.stringify({
								inline_keyboard: optsarray
							})
						};
						bot.sendMessage(user_id, blackcard+"\nElige una opcion:\n"+cards_string, opts);
					}, function (r_res){
						//Enviamos la carta y el lider por el grupo
						if (r_res.status == "ERR") {
							bot.answerCallbackQuery(msg.id, "Error inesperado.");
							console.log(r_res);
							return;
						}
						bot.sendMessage(msg.message.chat.id, "La carta negra de esta ronda es: \n"+r_res.data.blackcard);
						if (r_res.data.game_type == "clasico") {
							game.getUser(r_res.data.except_id, function (u_res){
								bot.sendMessage(u_res.msg.user_id, "Eres el lider de esta ronda.");
								bot.sendMessage(msg.message.chat.id, "El lider de esta ronda es: "+u_res.msg.username);
							});
						}
					});
				});
			} else if (data[0] == "card"){ 
				game.sendCard(res.msg._id, data[1], data[2], function (res){
					//Capturamos errores
					if (res.status == "ERR") {
						switch (res.msg) {
							case "ERR_USER_NO_GAME":
								bot.answerCallbackQuery(msg.id, "No estas jugando ninguna partida.");
							break;
							case "ERR_GAME_DELETED":
								bot.answerCallbackQuery(msg.id, "La partida que estabas jugando ya no existe.");
							break;
							case "ERR_GAME_NOT_STARTED":
								bot.answerCallbackQuery(msg.id, "La partida aun no se ha iniciado.");
							break;
							case "ERR_ALL_ALREADY_RESPONSED":
								bot.answerCallbackQuery(msg.id, "Ya ha respondido todo el mundo.");
							break;
							case "ERR_USER_ALREADY_RESPONSED":
								bot.answerCallbackQuery(msg.id, "Ya has respondido en esta ronda");
							break;
							case "ERR_DICTATOR_NOT_ALLOWED":
								bot.answerCallbackQuery(msg.id, "El dictador no puede elegir carta.");
							break;
							case "ERR_CARD_ALREADY_USED":
								bot.answerCallbackQuery(msg.id, "Ya has utilizado esa carta.");
							break;
							default:
								bot.answerCallbackQuery(msg.id, "Error inesperado.");
								console.log(res);
							break;
						}
						return;
					}
					bot.answerCallbackQuery(msg.id, "Has elegido: "+res.data.wcard_text);
					var opts = {
						chat_id: msg.message.chat.id, 
						message_id: msg.message.message_id
					};
					bot.editMessageText(res.data.blackcard+"\nHas elegido: "+res.data.wcard_text, opts);
					if (res.data.status != "NORMAL"){
						var optsarray = [];
						for (var card of res.data.card_array){
							optsarray.push([{text: card.text, callback_data: "vote_"+data[1]+"_"+card.id}]);
						}
						//Enviamos la cartas a cada jugador
						var opts2 = {
							reply_markup: JSON.stringify({
								inline_keyboard: optsarray
							})
						};
						//Segun el tipo de partida hace una cosa u otra
						if (res.data.game_type == "dictadura"){//Dictadura solo vota el lider
							res.data.card_string = res.data.blackcard+"\nEstas son las opciones, el lider votara por privado: \n"+res.data.card_string;
							bot.sendMessage(res.data.player_id, res.data.blackcard+"\nDebes votar una de estas opciones: ", opts2);
						} else if (res.data.game_type == "clasico") {//Clasico solo vota el lider de esa ronda
							res.data.card_string = res.data.blackcard+"\nEstas son las opciones, el lider de esta ronda votara por privado: \n"+res.data.card_string;
							bot.sendMessage(res.data.player_id, res.data.blackcard+"\nDebes votar una de estas opciones: ", opts2);
						} else if (res.data.game_type == "democracia"){//Democracia votan todos
							res.data.card_string = res.data.blackcard+"\nAhora podeis votar por privado entre las siguientes cartas: \n"+res.data.card_string;
							for (i = 0; i<res.data.player_id.length; i++){
								bot.sendMessage(res.data.player_id[i], res.data.blackcard+"\nDebes votar una de estas opciones: ", opts2);
							}
						} else bot.answerCallbackQuery(msg.id, "Ha ocurrido un error inesperado.");
						bot.sendMessage(res.data.room_id, res.data.card_string);
					}
				});
			} else if (data[0] == "vote"){ 
				game.sendVote(res.msg._id, data[1], data[2], function (res){
					//Capturamos errores
					if (res.status == "ERR") {
						switch (res.msg) {
							case "ERR_USER_NO_GAME":
								bot.answerCallbackQuery(msg.id, "No estas jugando ninguna partida.");
							break;
							case "ERR_GAME_DELETED":
								bot.answerCallbackQuery(msg.id, "La partida que estabas jugando ya no existe.");
							break;
							case "ERR_GAME_NOT_STARTED":
								bot.answerCallbackQuery(msg.id, "La partida aun no se ha iniciado.");
							break;
							case "ERR_ALL_NOT_ALREADY_RESPONSED":
								bot.answerCallbackQuery(msg.id, "Aun no han enviado carta todos los jugadores.");
							break;
							case "ERR_CARD_NOT_FOUND":
								bot.answerCallbackQuery(msg.id, "La carta votada no existe.");
							break;
							case "ERR_DICTATOR_NOT_ALLOWED":
								bot.answerCallbackQuery(msg.id, "El dictador no puede elegir carta.");
							break;
							default:
								bot.answerCallbackQuery(msg.id, "Error inesperado.");
								console.log(res);
							break;
						}
						return;
					}
					bot.answerCallbackQuery(msg.id, "Has votado: "+data[2]);
					var opts = {
						chat_id: msg.message.chat.id, 
						message_id: msg.message.message_id
					};
					bot.editMessageText("Has votado: "+res.data.vote.card_text, opts);
					if (res.status != "VOTED") {
						bot.sendMessage(res.data.player.player_uid, "Has ganado la ronda con tu carta: \n"+res.data.cards.card_text+"\nTienes "+(res.data.player.points+1)+" puntos.");
						bot.sendMessage(res.data.game.room_id, res.data.player.player_username+" ha ganado la ronda con su carta: \n"+res.data.cards.card_text+"\n"+
							"Tiene "+(parseInt(res.data.player.points)+1)+" puntos.");
					
						game.roundWinner(res.data.player, res.data.game, function (resp) {
							if (resp.status == "ERR") {
								bot.answerCallbackQuery(msg.id, "Error inesperado.");
								console.log(resp);
								return;
							}
							setTimeout(function(){
								var opts = {
									chat_id: res.data.game.room_id, 
									message_id: res.data.game.msg_id
								};
								bot.editMessageText("Partida finalizada.\n"+res.data.player.player_username+" ha ganado la partida.", opts);
								bot.sendMessage(res.data.player.player_uid, emoji.confetti_ball+" Has ganado la partida!! "+emoji.confetti_ball);
								bot.sendMessage(res.data.game.room_id, res.data.player.player_username+" ha ganado la partida!! "+emoji.confetti_ball+" "+emoji.confetti_ball);
								
							}, 300);
						}, function (resp) {
							if (resp.status == "ERR") {
								bot.answerCallbackQuery(msg.id, "Error inesperado.");
								console.log(resp);
								return;
							}
							//Iniciamos la primera ronda
							game.startRound(res.data.game, res.data.players, function (user_id, blackcard, cards_array, cards_string){
								var optsarray = [];
								for (var card of cards_array){
									optsarray.push([{text: card.text, callback_data: "card_"+data[1]+"_"+card.id}]);
								}
								//Enviamos la cartas a cada jugador
								var opts = {
									reply_markup: JSON.stringify({
										inline_keyboard: optsarray
									})
								};
								bot.sendMessage(user_id, blackcard+"\nElige una opcion:\n"+cards_string, opts);
							}, function (r_res){
								//Enviamos la carta y el lider por el grupo
								if (r_res.status == "ERR") {
									bot.answerCallbackQuery(msg.id, "Error inesperado.");
									console.log(r_res);
									return;
								}
								bot.sendMessage(res.data.game.room_id, "La carta negra de esta ronda es: \n"+r_res.data.blackcard);
								if (r_res.data.game_type == "clasico") {
									game.getUser(r_res.data.except_id, function (u_res){
										bot.sendMessage(u_res.msg.user_id, "Eres el lider de esta ronda.");
										bot.sendMessage(msg.message.chat.id, "El lider de esta ronda es: "+u_res.msg.username);
									});
								}
							});
						});
					}
				});
			} else if (data[0] == "leave"){
				if (!res.playing){
					bot.answerCallbackQuery(msg.id, "No eres miembro de ninguna partida.");
					return;
				}
				game.leaveGame(res.msg._id, data[1], function (res){
					//Capturamos errores
					if (res.status == "ERR") {
						switch (res.msg) {
							case "ERR_NO_GAME_PARTICIPANT":
								bot.answerCallbackQuery(msg.id, "No eres miembro de ninguna partida.");
							break;
							case "ERR_NO_ACTIVE_GAMES":
								bot.answerCallbackQuery(msg.id, "La partida ya no está activa.");
							break;
							case "ERR_CREATOR_CANT_LEAVE":
								bot.answerCallbackQuery(msg.id, "Lo sentimos, el creador no puede dejar la partida.");
							break;
							default:
								bot.answerCallbackQuery(msg.id, "Error inesperado.");
								console.log(res);
							break;
						}
						return;
					}
					if (res.msg == "DELETE_GAME"){
						game.deleteGame(res.msg._id, data[1], function (res){
							//Capturamos errores
							if (res.status == "ERR") {
								switch (res.msg) {
									case "ERR_NO_ACTIVE_GAMES":
										bot.answerCallbackQuery(msg.id, "Esta partida ya está borrada.");
									break;
									case "ERR_CREATOR_DELETE":
										bot.answerCallbackQuery(msg.id, "Solo el creador puede borrar la partida.");
									break;
									default:
										bot.answerCallbackQuery(msg.id, "Error inesperado.");
										console.log(res);
									break;
								}
								return;
							}
							bot.editMessageText("Partida borrada", {chat_id: msg.message.chat.id, message_id: msg.message.message_id});
							bot.answerCallbackQuery(msg.id, "Has abandonado y se ha borrado la partida.");
						});
					} else if (res.msg == "DELETE_PLAYER_STARTED") {
						game.db.find('cardsxround', {game_id: game.db.getObjectId(data[1])}, function(n_cards){
							if (n_cards != res.msg.n_players-1){
								bot.answerCallbackQuery(msg.id, "No puedes abandonar la partida.");
								return;
							}
							game.db.update('games', {game_id: game.db.getObjectId(data[1])}, { "n_players": (parseInt(res.msg.n_players)-1)}, function (){
								game.db.remove('playersxgame', {player_id: res.msg._id}, function (){
									bot.answerCallbackQuery(msg.id, "Has abandonado la partida.");
									//ToDo: modificar el mensaje principal
								});
							});
						});
					} else if (res.msg == "DELETE_PLAYER_NOT_STARTED"){
						game.leaveUser(res.msg._id, function (){
							//Capturamos errores
							if (res.status == "ERR") {
								switch (res.msg) {
									default:
										bot.answerCallbackQuery(msg.id, "Error inesperado.");
										console.log(res);
									break;
								}
								return;
							}
							game.db.find('playersxgame', {game_id: game.db.getObjectId(data[1])}, function (response){
								if (!response.length){
									bot.answerCallbackQuery(msg.id, "Error inesperado.");
									return;
								}
								//ToDo: editar el mensaje principal
								bot.answerCallbackQuery(msg.id, "Has abandonado la partida.");
							});
						});
					} else bot.answerCallbackQuery(msg.id, "Error desconocido.");
				});
			} else if (data[0] == "checkcards"){
				game.checkCards(data[1], function (res) {
					//Capturamos errores
					if (res.status == "ERR") {
						switch (res.msg) {
							case "ERR_NO_ACTIVE_GAMES":
								bot.answerCallbackQuery(msg.id, "Este grupo no tiene partidas activas.");
							break;
							case "ERR_GAME_NOT_STARTED":
								bot.answerCallbackQuery(msg.id, "La partida aun no esta iniciada.");
							break;
							case "ERR_ALREADY_STARTED":
								bot.answerCallbackQuery(msg.id, "Todo el mundo ha elegido carta.");
							break;
							default:
								bot.answerCallbackQuery(msg.id, "Error inesperado.");
								console.log(res);
							break;
						}
						return;
					}
					bot.sendMessage(msg.message.chat.id, "Aun no han elegido carta:\n"+res.data.players);
				});
			} else if (data[0] == "checkvotes"){
				game.checkVotes(data[1], function (res) {
					//Capturamos errores
					if (res.status == "ERR") {
						switch (res.msg) {
							case "ERR_NO_ACTIVE_GAMES":
								bot.answerCallbackQuery(msg.id, "Este grupo no tiene partidas activas.");
							break;
							case "ERR_GAME_NOT_STARTED":
								bot.answerCallbackQuery(msg.id, "La partida aun no esta iniciada.");
							break;
							case "ERR_NOT_ALREADY_STARTED":
								bot.answerCallbackQuery(msg.id, "Aun no han elegido carta todos los jugadores.");
							break;
							default:
								bot.answerCallbackQuery(msg.id, "Error inesperado.");
								console.log(res);
							break;
						}
						return;
					}
					//ToDo?: ver quien falta por votar
					bot.answerCallbackQuery(msg.id, "Han votado "+res.data.votes+" jugadores de "+res.data.max_votes);
				});
			}
		});
	});
	//Cartas contra la humanidad
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
							game.db.update('dictionaries', {creator_id: msg.from.id}, {"valid": 1}, function (){
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
	//Extra
	bot.onText(new RegExp("^\\/sendMessage(?:@"+privatedata.botalias+")?\\s(.*)", "i"), function (msg, match) {
		if (msg.chat.type == "private") {
			if (msg.chat.id == privatedata.ownerid) {
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
	bot.onText(new RegExp("^\/version(?:@"+privatedata.botalias+")?", "i"), function (msg, match) {
		bot.sendMessage(msg.chat.id, "Versión 0.5. Creado por @"+privatedata.owneralias+".\nAgradecimientos a Eli y Jesus por el testeo y el mensaje de ayuda");
	});
	//Si el comando es /create
	bot.onText(new RegExp("^\/create(?:@"+privatedata.botalias+")?$", "i"), function (msg, match) {
		bot.sendMessage(msg.chat.id, "Error en la sintaxis, consulta /help para mas informacion.");
	});
	//Si el comando es /help
	bot.onText(new RegExp("^\/help(?:@"+privatedata.botalias+")?$", "i"), function (msg, match) {
		bot.sendMessage(msg.chat.id, 'Bienvenido a la ayuda de '+privatedata.botname+', el bot para telegram.\n'+
		'Puedes consultar la ayuda en el siguiente enlace: http://telegra.ph/Manual-CCLH-BOT-02-06\n'+
		'Disfrutad del bot y... ¡A jugar!');
	});
});
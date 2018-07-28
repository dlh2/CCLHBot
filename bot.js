//Override promises
process.env.NTBA_FIX_319 = true;

//Cargamos los modulos necesarios
const TelegramBot = require('node-telegram-bot-api');
const privatedata = require('./privatedata');
const GameBot = require('./game');
const emoji = require('node-emoji').emoji;

//Iniciamos el bot y mongodb
const bot = new TelegramBot(privatedata.token, {polling: true});

//Debug
bot.on('polling_error', (error) => {
  console.log(error);  // => 'EFATAL'
});

//Iniciamos el Bot
var game = new GameBot(privatedata.url, privatedata.db, function (res){
	if (res.status == "ERR") {
		console.error("No se ha podido conectar a la base de datos");
		return;
	}
	//////////////////////////////EVENTOS//////////////////////////////
	//Si el comando es /start (por privado):
	bot.onText(new RegExp("^\\/start(?:@"+privatedata.botalias+")?", "i"), (msg, match) => {
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type != "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por un privado.");
			return;
		}
		//Creamos el usuario
		game.createUser({user_id: msg.from.id, username: game.getUsername(msg.from)}, function (res){
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
			bot.sendMessage(msg.from.id, "Cuenta creada.\n"+
			"Si cambias de nombre de usuario (o apodo), puedes decirme /refresh por privado para actualizarlo en nuestra base de datos.\n"+
			"Utiliza el comando /create en un grupo para crear una partida o haz click en 'Unirse a la partida' si ya hay una creada.");
		});
	});
	//Si el comando es /refresh (por privado):
	bot.onText(new RegExp("^\\/refresh(?:@"+privatedata.botalias+")?", "i"), (msg, match) => {
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type != "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por un privado.");
			return;
		}
		//Modificamos el usuario
		game.modifyUser(msg.from.id, {username: game.getUsername(msg.from)}, function (res){
			if (res.status == "ERR") {
				switch (res.msg) {
					case "ERR_NOT_IN_GAME":
						bot.sendMessage(msg.chat.id, "No estas registrado en el juego.");
					break;
					default:
						bot.sendMessage(msg.chat.id, "Error inesperado.");
						console.log(res);
					break;
				}
				return;
			}
			bot.sendMessage(msg.from.id, "Has actualizado tus datos!");
		});
	});

	//Si el comando es /create
	bot.onText(new RegExp("^\\/create(?:@"+privatedata.botalias+")?", "i"), (msg, match) => {
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
			//Creamos la partida
			game.createGame({
				room_id: msg.chat.id,
				creator_id: res.msg._id,
				status: -1
			}, function (game_res){
				//Capturamos errores
				if (game_res.status == "ERR") {
					switch (game_res.msg) {
						case "ERR_ACTIVE_GAME":
							bot.sendMessage(msg.chat.id, "Este grupo ya tiene una partida activa, su creador debe borrarla antes de crear otra.");
						break;
						case "ERR_ALREADY_PLAYING":
							bot.sendMessage(msg.chat.id, "No puedes crear la partida, ya estas participando en otra partida.");
						break;
						case "ERR_ALREADY_CREATING":
							bot.sendMessage(msg.chat.id, "No puedes crear la partida, ya estas creando otra partida.");
						break;
						default:
							bot.sendMessage(msg.chat.id, "Error inesperado.");
							console.log(game_res);
						break;
					}
					return;
				}
				var opts = {
					reply_markup: JSON.stringify({
						inline_keyboard: [
							[{text: "Democracia", callback_data: "create_type_democracia"}],
							[{text: "Clásico", callback_data: "create_type_clasico"}],
							[{text: "Dictadura", callback_data: "create_type_dictadura"}],
							[{text: "Borrar la partida", callback_data: "delete_"+game_res.msg.game_id}]
						]
					})
				};
				//Añadimos a la base de datos el tipo de partida
				bot.sendMessage(msg.chat.id, "Se ha creado la partida.\nElige el tipo de partida: ", opts).then(resp => {
					game.modifyGame(game_res.msg.game_id, {msg_id: resp.message_id}, function(game_res){
						//Capturamos errores
						if (game_res.status == "ERR") {
							switch (game_res.msg) {
								case "ERR_BAD_GAME":
									bot.sendMessage(msg.chat.id, "Este grupo no tiene partida activa o la partida ya esta iniciada.");
								break;
								default:
									bot.sendMessage(msg.chat.id, "Error inesperado.");
									console.log(game_res);
								break;
							}
							return;
						}
					});
				});
			});
		});
	});
	//Si recibimos una callbackQuery
	bot.on("callback_query", function (msg) {
		game.getUser(msg.from.id, function (res){
			//Capturamos errores
			if (res.status == "ERR") {
				switch (res.msg) {
					case "ERR_NOT_IN_GAME":
						bot.answerCallbackQuery(msg.id, {"text": "Debes hablar conmigo (@"+privatedata.botalias+") por privado y mandar el mensaje /start."});
					break;
					default:
						bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
						console.log(res);
					break;
				}
				return;
			}
			//Parsea la peticion del usuario
			var data = msg.data.split("_");
			switch (data[0]) {
				//Parametros de creacion de partida
				case "create":
					game.db.findOne('games', {creator_id: res.msg._id, room_id: msg.message.chat.id}, function (g_res){
						if (!g_res){
							bot.answerCallbackQuery(msg.id, {"text": "Solo el creador puede configurar la partida."});
							return;
						}
						switch (data[1]){
							//Tipo de partida
							case "type":
								var data_obj = {};
								if (data[2] == "democracia") {
									data_obj = {type: data[2]};
								} else if (data[2] == "dictadura"){
									data_obj = {type: data[2], president_id: res.msg._id};
								} else if (data[2] == "clasico") {
									data_obj = {type: data[2], president_id: res.msg._id, president_order: 1};
								} else {
									bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
									console.log(data[2]);
									return;
								}
								//Modifica la base de datos para añadir el tipo
								game.modifyGame(g_res._id, data_obj, function(game_res){
									//Capturamos errores
									if (game_res.status == "ERR") {
										switch (game_res.msg) {
											case "ERR_BAD_GAME":
												bot.answerCallbackQuery(msg.id, {"text": "Este grupo no tiene partida activa o la partida ya esta iniciada."});
											break;
											default:
												bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
												console.log(game_res);
											break;
										}
										return;
									}
									bot.answerCallbackQuery(msg.id, {"text": "Seleccionado " + data[2] + " como modo de juego."});
									var opts = {
										chat_id: msg.message.chat.id, 
										message_id: msg.message.message_id,
										reply_markup: JSON.stringify({
											inline_keyboard: [
												[{text: "3", callback_data: "create_nplayers_3"},{text: "4", callback_data: "create_nplayers_4"}],
												[{text: "5", callback_data: "create_nplayers_5"},{text: "6", callback_data: "create_nplayers_6"}],
												[{text: "7", callback_data: "create_nplayers_7"},{text: "8", callback_data: "create_nplayers_8"}],
												[{text: "Borrar la partida", callback_data: "delete_"+g_res._id}]
											]
										})
									};
									bot.editMessageText("Elige el número de jugadores: ", opts);
								});
							break;
							//Numero de jugadores de la partida
							case "nplayers":
								var nplayers = parseInt(data[2]);
								if (isNaN(nplayers) || (nplayers < 1 || nplayers > 8)) {
									bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
									console.log(data[2]);
									return;
								}
								//Modifica la base de datos para añadir el numero de jugadores
								game.modifyGame(g_res._id, {n_players: nplayers}, function(game_res){
									//Capturamos errores
									if (game_res.status == "ERR") {
										switch (game_res.msg) {
											case "ERR_BAD_GAME":
												bot.answerCallbackQuery(msg.id, {"text": "Este grupo no tiene partida activa o la partida ya esta iniciada."});
											break;
											default:
												bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
												console.log(game_res);
											break;
										}
										return;
									}
									bot.answerCallbackQuery(msg.id, {"text": "Seleccionado " + nplayers + " como número de jugadores."});
									var array = [];
									var cont = 1;
									for (var i = 0; i < 3; i++){
										var row = [];
										for (var j = 0; j < 3; j++){
											if (cont*parseInt(data[2]) <= 45) {
												row.push({text: cont.toString(), callback_data: "create_ncardstowin_"+cont.toString()});
											}
											cont++;
										}
										if (row.length) array.push(row);
									}
									array.push([{text: "Borrar la partida", callback_data: "delete_"+g_res._id}]);
									var opts = {
										chat_id: msg.message.chat.id, 
										message_id: msg.message.message_id,
										reply_markup: JSON.stringify({
											inline_keyboard: array
										})
									};
									bot.editMessageText("Elige el numero de cartas necesarias para ganar: ", opts);
								});
							break;
							//Numero de cartas negras necesarias para ganar
							case "ncardstowin":
								if (isNaN(data[2]) != true && (parseInt(data[2]) < 1 || parseInt(data[2]) > 9)) {
									bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
									console.log(data[2]);
									return;
								}
								//Modifica la base de datos para añadir el numero de cartas negras necesarias para ganar
								game.modifyGame(g_res._id, {n_cardstowin: data[2]}, function(game_res){
									//Capturamos errores
									if (game_res.status == "ERR") {
										switch (game_res.msg) {
											case "ERR_BAD_GAME":
												bot.answerCallbackQuery(msg.id, {"text": "Este grupo no tiene partida activa o la partida ya esta iniciada."});
											break;
											default:
												bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
												console.log(game_res);
											break;
										}
										return;
									}
									bot.answerCallbackQuery(msg.id, {"text": "Seleccionado " + data[2] + " como numero de cartas para ganar."});
									game.db.limitFind('dictionaries', {finished:1}, 5, function(res){
										var array = [];
										for (var row of res){
											array.push([{text: row.name, callback_data: "create_dictionary_"+row._id}]);
										}
										array.push([{text: "Borrar la partida", callback_data: "delete_"+g_res._id}]);
										var opts = {
											chat_id: msg.message.chat.id, 
											message_id: msg.message.message_id,
											reply_markup: JSON.stringify({
												inline_keyboard: array
											})
										};
										bot.editMessageText("Por ultimo elige un diccionario de cartas:", opts);
									});
								});
							break;
							//Diccionario a utilizar en la partida
							case "dictionary":
								if (isNaN(data[2]) != true && (parseInt(data[2]) < 1 || parseInt(data[2]) > 9)) {
									bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
									console.log(data[2]);
									return;
								}
								game.db.findOne('dictionaries', {_id: game.db.getObjectId(data[2]), finished:1}, function (dictionary_res){
									if (!dictionary_res){
										bot.answerCallbackQuery(msg.id, {"text": "Error el diccionario no existe."});
										return;
									}
									//Modifica el juego para incluir el diccionario
									game.modifyGame(g_res._id, {dictionary: dictionary_res._id, currentblack: 0, status: 0}, function(game_res){
										//Capturamos errores
										if (game_res.status == "ERR") {
											switch (game_res.msg) {
												case "ERR_BAD_GAME":
													bot.answerCallbackQuery(msg.id, {"text": "Este grupo no tiene partida activa o la partida ya esta iniciada."});
												break;
												default:
													bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
													console.log(game_res);
												break;
											}
											return;
										}
										bot.answerCallbackQuery(msg.id, {"text": "Seleccionado " + dictionary_res.name + " como diccionario de cartas."});
										game.db.findMany('blackcards', {dictionary: dictionary_res._id}, function (array){
											array = game.shuffleArray(array);
											newarray = [];
											for (i = 0; i < array.length; i++){
												newarray.push({card_text: array[i].card_text, game_id: g_res._id, game_order: i});
											}
											if (newarray.length > 0) game.db.insertMany('bcardsxgame', newarray);
										});
										var opts = {
											chat_id: msg.message.chat.id, 
											message_id: msg.message.message_id,
											reply_markup: JSON.stringify({
												inline_keyboard: [
													[{text: "Unirse a la partida", callback_data: "join_"+g_res._id}],
													[{text: "Borrar la partida", callback_data: "delete_"+g_res._id}],
													[{text: "Iniciar la partida", callback_data: "start_"+g_res._id}]
												]
											})
										};
										bot.editMessageText("Se ha terminado de crear la partida, una vez que se unan todos los jugadores, pulsa 'Iniciar la partida' para jugar. Hasta ahora se ha unido:\n"+res.msg.username, opts);
										//Añadimos a la partida al usuario que la ha creado
										game.joinGame({
											game_id: game.db.getObjectId(g_res._id),
											player_id: game.db.getObjectId(res.msg._id),
											player_uid: res.msg.user_id,
											player_username: res.msg.username, 
											points: 0, 
											vote_delete: 0
										}, function (player_res){
											//Capturamos errores
											if (player_res.status == "ERR") {
												switch (player_res.msg) {
													case "ERR_ALREADY_CREATING":
														//None
													break;
													default:
														bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
														console.log(player_res);
													break;
												}
												return;
											}
											bot.sendMessage(res.msg.user_id, "Te has unido a una partida.");
										});
									});
								});
							break;
							default:
								bot.answerCallbackQuery(msg.id, {"text": "ERROR: Opción incorrecta."});
								return;
							break;
						}
					});
				break;
				//Peticion para unirse a una partida
				case "join":
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
									bot.answerCallbackQuery(msg.id, {"text": "Esta partida no existe."});
								break;
								case "ERR_ALREADY_STARTED":
									bot.answerCallbackQuery(msg.id, {"text": "Esta partida ya está iniciada."});
								break;
								case "ERR_ALREADY_FILLED":
									bot.answerCallbackQuery(msg.id, {"text": "La partida ya está llena."});
								break;
								case "ERR_ALREADY_PLAYING":
									bot.answerCallbackQuery(msg.id, {"text": "No puedes unirte a la partida porque ya estas participando en otra."});
								break;
								case "ERR_ALREADY_CREATING":
									bot.answerCallbackQuery(msg.id, {"text": "No puedes unirte la partida, estas creando otra partida."});
								break;
								default:
									bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
									console.log(join_res);
								break;
							}
							return;
						}
						bot.answerCallbackQuery(msg.id, {"text": "Te has unido correctamente a la partida."});
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
				break;
				//Peticion para iniciar una partida
				case "start":
					game.startGame(res.msg._id, data[1], function (game_res){ 
						//Capturamos errores
						if (game_res.status == "ERR") {
							switch (game_res.msg) {
								case "ERR_NO_ACTIVE_GAMES":
									bot.answerCallbackQuery(msg.id, {"text": "Este grupo no tiene partidas activas."});
								break;
								case "ERR_NOT_CREATOR_START":
									bot.answerCallbackQuery(msg.id, {"text": "Solo el creador puede iniciar la partida."});
								break;
								case "ERR_ALREADY_STARTED":
									bot.answerCallbackQuery(msg.id, {"text": "La partida ya esta iniciada."});
								break;
								case "ERR_STILL_CREATING":
									bot.answerCallbackQuery(msg.id, {"text": "Error, aun se esta creando la partida"});
								break;
								case "ERR_NOT_ENOUGHT_PLAYERS":
									bot.answerCallbackQuery(msg.id, {"text": "Aun no se ha llenado la partida. "+game_res.extra.current_players+" de "+game_res.extra.max_players+" participantes"});
								break;
								default:
									bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
									console.log(game_res);
								break;
							}
							return;
						}
						//Guardamos las cartas
						game.db.findMany('whitecards', {dictionary: game_res.msg.game.dictionary}, function (array){
							var cards_per_player = parseInt(game_res.msg.game.n_players) * privatedata.cardsperround;
							array = game.shuffleArray(array).slice(0, cards_per_player * parseInt(game_res.msg.game.n_cardstowin));
							var newarray = [];
							for (i = 0; i < game_res.msg.game.n_players; i++){
								for (j = i*cards_per_player; j < (i*cards_per_player)+cards_per_player; j++){
									newarray.push({card_text: array[j].card_text, game_id: game_res.msg.game._id, player_id: game_res.msg.players[i].player_id, used: 0});
								}
							}
							game.db.insertMany('wcardsxgame', newarray, function (){
								var options = [
									[{text: "Borrar la partida", callback_data: "delete_"+data[1]}],
									[{text: "Consultar cartas", callback_data: "checkcards_"+data[1]}]
								];
								if (game_res.msg.game.type=="democracia"){
									options.push([{text: "Consultar votos", callback_data: "checkvotes_"+data[1]}]);
								}
								var opts = {
									chat_id: msg.message.chat.id, 
									message_id: msg.message.message_id,
									reply_markup: JSON.stringify({
										inline_keyboard: options
									})
								};
								bot.editMessageText(msg.message.text, opts);
								//Iniciamos la primera ronda
								game.startRound(game_res.msg.game, game_res.msg.players, function (user_id, blackcard, cards_array, cards_string){
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
										bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
										console.log(r_res);
										return;
									}
									bot.sendMessage(msg.message.chat.id, "La carta negra de esta ronda es: \n"+r_res.data.blackcard);
									if (r_res.data.game_type == "clasico") {
										game.getUser(game_res.msg.game.president_id, function (u_res){
											//Capturamos errores
											if (u_res.status == "ERR") {
												switch (u_res.msg) {
													case "ERR_NOT_IN_GAME":
														bot.sendMessage(msg.chat.id, "Debes hablar conmigo (@"+privatedata.botalias+") por privado y mandar el mensaje /start.");
													break;
													default:
														bot.sendMessage(msg.chat.id, "Error inesperado.");
														console.log(u_res);
													break;
												}
												return;
											}
											bot.sendMessage(u_res.msg.user_id, "Eres el lider de esta ronda.");
											bot.sendMessage(msg.message.chat.id, "El lider de esta ronda es: "+u_res.msg.username);
										});
									}
								});
							});
						});
					});
				break;
				//Peticion para borrar una partida
				case "delete":
					game.deleteGame(res.msg._id, data[1], function (res){
						//Capturamos errores
						if (res.status == "ERR") {
							switch (res.msg) {
								case "ERR_NO_ACTIVE_GAMES":
									bot.answerCallbackQuery(msg.id, {"text": "Esta partida ya está borrada."});
								break;
								case "ERR_NOT_IN_THIS_GAME":
									bot.answerCallbackQuery(msg.id, {"text": "No estas jugando en esta partida."});
								break;
								case "ERR_ALREADY_VOTED":
									bot.answerCallbackQuery(msg.id, {"text": "Ya has votado."});
								break;
								default:
									bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
									console.log(res);
								break;
							}
							return;
						} else if (res.status == "OK"){
							game.db.remove('wcardsxgame', {game_id: game.db.getObjectId(data[1])});
							game.db.remove('bcardsxgame', {game_id: game.db.getObjectId(data[1])});
							game.db.remove('cardsxround', {game_id: game.db.getObjectId(data[1])});
							game.db.remove('votesxround', {game_id: game.db.getObjectId(data[1])});
							game.db.remove('votedeletexgame', {game_id: game.db.getObjectId(data[1])});
							bot.editMessageText("Partida borrada", {chat_id: msg.message.chat.id, message_id: msg.message.message_id});
							bot.answerCallbackQuery(msg.id, {"text": "Se ha borrado la partida."});
						} else if (res.status == "VOTED"){
							bot.answerCallbackQuery(msg.id, {"text": "Has emitido un voto para borrar la partida. Votos necesarios: "+res.msg.votes+" de "+res.msg.n_players});
						} else {
							bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
						}
					});
				break;
				//Peticion para abandonar una partida
				case "leave":
					game.leaveGame(res.msg._id, data[1], function (res){
						//Capturamos errores
						if (res.status == "ERR") {
							switch (res.msg) {
								case "ERR_NO_GAME_PARTICIPANT":
									bot.answerCallbackQuery(msg.id, {"text": "No eres miembro de ninguna partida."});
								break;
								case "ERR_NO_ACTIVE_GAMES":
									bot.answerCallbackQuery(msg.id, {"text": "Esta partida ya está borrada."});
								break;
								case "ERR_CREATOR_CANT_LEAVE":
									bot.answerCallbackQuery(msg.id, {"text": "Lo sentimos, el creador no puede dejar la partida."});
								break
								case "ERR_CANT_LEAVE":
									bot.answerCallbackQuery(msg.id, {"text": "Lo sentimos, el creador no puede dejar la partida."});
								break;
								case "ERR_CREATOR_DELETE":
									bot.answerCallbackQuery(msg.id, {"text": "Solo el creador puede borrar la partida."});
								break;
								default:
									bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
									console.log(res);
								break;
							}
							return;
						} 
						if (res.status == "DELETE_GAME"){ //Borra la partida
							bot.editMessageText("Partida borrada", {chat_id: msg.message.chat.id, message_id: msg.message.message_id});
							bot.answerCallbackQuery(msg.id, {"text": "Has abandonado y se ha borrado la partida."});
						} else if (res.status == "DELETE_PLAYER_STARTED") { //Elimina al usuario con la partida ya iniciada
							game.db.count('cardsxround', {game_id: game.db.getObjectId(data[1])}, function(n_cards){
								//No puedes abandonar la partida si solo quedas tu por elegir carta
								if (n_cards == res.msg.n_players-1){
									bot.answerCallbackQuery(msg.id, {"text": "No puedes abandonar la partida, debes elegir carta primero."});
									return;
								}
								game.db.count('votesxround', {game_id: game.db.getObjectId(data[1])}, function(n_votes){
									//No puedes abandonar la partida si solo quedas tu por elegir carta
									if (n_votes == res.msg.n_players-1){
										bot.answerCallbackQuery(msg.id, {"text": "No puedes abandonar la partida, debes votar primero."});
										return;
									}
									//Actualiza la base de datos para eliminar al jugador y reducir el tamaño de la partida
									game.db.updateOne('games', {game_id: game.db.getObjectId(data[1])}, { "n_players": (parseInt(res.msg.n_players)-1)}, function (){
										game.db.remove('playersxgame', {player_id: res.msg._id}, function (){
											game.db.findMany('playersxgame', {game_id: game.db.getObjectId(data[1])}, function (response){
												if (!response.length){
													bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
													return;
												}
												var participants = "";
												for (var user of response){
													participants += user.player_username+"\n";
												}
												bot.editMessageText("Participantes: "+participants, {chat_id: msg.message.chat.id, message_id: msg.message.message_id});
												bot.answerCallbackQuery(msg.id, {"text": "Has abandonado la partida."});
											});
										});
									});
								});
							});
						} else if (res.status == "DELETE_PLAYER_NOT_STARTED"){ //Elimina al usuario con la partida sin empezar
							//Actualiza la base de datos para eliminar al jugador
							game.db.findMany('playersxgame', {game_id: game.db.getObjectId(data[1])}, function (r_players){
								if (!r_players.length){
									bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
									return;
								}
								var participants = "";
								for (var player of r_players){
									participants += player.player_username+"\n";
								}
								bot.editMessageText("Participantes: "+participants, {chat_id: msg.message.chat.id, message_id: msg.message.message_id});
								bot.answerCallbackQuery(msg.id, {"text": "Has abandonado la partida."});
							});
						} else bot.answerCallbackQuery(msg.id, {"text": "Error desconocido."});
					});
				break;
				//Si el jugador envia una carta
				case "card":
					game.sendCard(res.msg._id, data[1], data[2], function (res){
						//Capturamos errores
						if (res.status == "ERR") {
							switch (res.msg) {
								case "ERR_USER_NO_GAME":
									bot.answerCallbackQuery(msg.id, {"text": "No estas jugando ninguna partida."});
								break;
								case "ERR_GAME_DELETED":
									bot.answerCallbackQuery(msg.id, {"text": "La partida que estabas jugando ya no existe."});
								break;
								case "ERR_GAME_NOT_STARTED":
									bot.answerCallbackQuery(msg.id, {"text": "La partida aun no se ha iniciado."});
								break;
								case "ERR_ALL_ALREADY_RESPONSED":
									bot.answerCallbackQuery(msg.id, {"text": "Ya han respondido todos los jugadores."});
								break;
								case "ERR_USER_ALREADY_RESPONSED":
									bot.answerCallbackQuery(msg.id, {"text": "Ya has respondido en esta ronda"});
								break;
								case "ERR_DICTATOR_NOT_ALLOWED":
									bot.answerCallbackQuery(msg.id, {"text": "El dictador no puede elegir carta."});
								break;
								case "ERR_CARD_ALREADY_USED":
									bot.answerCallbackQuery(msg.id, {"text": "Ya has utilizado esa carta."});
								break;
								default:
									bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
									console.log(res);
								break;
							}
							return;
						}
						bot.answerCallbackQuery(msg.id, {"text": "Has elegido: "+res.data.wcard_text});
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
							} else bot.answerCallbackQuery(msg.id, {"text": "Ha ocurrido un error inesperado."});
							bot.sendMessage(res.data.room_id, res.data.card_string);
						}
					});
				break;
				//Si el jugador vota una carta
				case "vote":
					game.sendVote(res.msg._id, data[1], data[2], function (res){
						//Capturamos errores
						if (res.status == "ERR") {
							switch (res.msg) {
								case "ERR_USER_NO_GAME":
									bot.answerCallbackQuery(msg.id, {"text": "No estas jugando ninguna partida."});
								break;
								case "ERR_GAME_DELETED":
									bot.answerCallbackQuery(msg.id, {"text": "La partida que estabas jugando ya no existe."});
								break;
								case "ERR_GAME_NOT_STARTED":
									bot.answerCallbackQuery(msg.id, {"text": "La partida aun no se ha iniciado."});
								break;
								case "ERR_ALL_NOT_ALREADY_RESPONSED":
									bot.answerCallbackQuery(msg.id, {"text": "Aun no han enviado carta todos los jugadores."});
								break;
								case "ERR_CARD_NOT_FOUND":
									bot.answerCallbackQuery(msg.id, {"text": "La carta votada no existe."});
								break;
								case "ERR_DICTATOR_ONLY_ALLOWED":
									bot.answerCallbackQuery(msg.id, {"text": "Solo el dictador puede elegir carta."});
								break;
								default:
									bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
									console.log(res);
								break;
							}
							return;
						}
						bot.answerCallbackQuery(msg.id, {"text": "Has votado: "+res.data.vote.card_text});
						var opts = {
							chat_id: msg.message.chat.id, 
							message_id: msg.message.message_id
						};
						bot.editMessageText("Has votado: "+res.data.vote.card_text, opts);
						//Si ha sido el ultimo en votar...
						if (res.status != "VOTED") {
							bot.sendMessage(res.data.player.player_uid, 
								"Has ganado la ronda con tu carta: \n"+res.data.cards.card_text+"\n"+
								"Tienes "+(res.data.player.points+1)+" puntos."
							);
							bot.sendMessage(res.data.game.room_id, 
								res.data.player.player_username+" ha ganado la ronda con su carta: \n"+res.data.cards.card_text+"\n"+
								"Tiene "+(parseInt(res.data.player.points)+1)+" puntos."
							);
							//Determinamos el ganador de la ronda
							game.roundWinner(res.data.player, res.data.game, function (resp) {
								if (resp.status == "ERR") { //Capturamos errores
									bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
									console.log(resp);
									return;
								} else if (resp.status == "END_GAME"){ //Ha terminado la partida
									game.db.remove('wcardsxgame', {game_id: game.db.getObjectId(res.data.game._id)});
									game.db.remove('bcardsxgame', {game_id: game.db.getObjectId(res.data.game._id)});
									game.db.remove('cardsxround', {game_id: game.db.getObjectId(res.data.game._id)});
									game.db.remove('votesxround', {game_id: game.db.getObjectId(res.data.game._id)});
									game.db.remove('votedeletexgame', {game_id: game.db.getObjectId(res.data.game._id)});
									setTimeout(function(){
										var opts = {
											chat_id: res.data.game.room_id, 
											message_id: res.data.game.msg_id
										};
										bot.editMessageText("Partida finalizada.\n"+res.data.player.player_username+" ha ganado la partida.", opts);
										bot.sendMessage(res.data.player.player_uid, emoji.confetti_ball+" Has ganado la partida!! "+emoji.confetti_ball);
										bot.sendMessage(res.data.game.room_id, res.data.player.player_username+" ha ganado la partida!! "+emoji.confetti_ball+" "+emoji.confetti_ball);
									}, 300);
								} else { //No ha terminado la partida
									//Iniciamos la siguiente ronda
									game.startRound(resp.msg.game, res.data.players, function (user_id, blackcard, cards_array, cards_string){
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
											bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
											console.log(r_res);
											return;
										}
										bot.sendMessage(res.data.game.room_id, "La carta negra de esta ronda es: \n"+r_res.data.blackcard);
										if (r_res.data.game_type == "clasico") {
											game.getUser(resp.msg.game.president_id, function (u_res){
												//Capturamos errores
												if (u_res.status == "ERR") {
													switch (u_res.msg) {
														case "ERR_NOT_IN_GAME":
															bot.sendMessage(msg.chat.id, "Debes hablar conmigo (@"+privatedata.botalias+") por privado y mandar el mensaje /start.");
														break;
														default:
															bot.sendMessage(msg.chat.id, "Error inesperado.");
															console.log(u_res);
														break;
													}
													return;
												}
												bot.sendMessage(u_res.msg.user_id, "Eres el lider de esta ronda.");
												bot.sendMessage(res.data.game.room_id, "El lider de esta ronda es: "+u_res.msg.username);
											});
										}
									});
								}
							});
						}
					});
				break;
				//Peticion para comprobar quien falta por enviar carta
				case "checkcards":
					game.checkCards(data[1], function (res) {
						//Capturamos errores
						if (res.status == "ERR") {
							switch (res.msg) {
								case "ERR_NO_ACTIVE_GAMES":
									bot.answerCallbackQuery(msg.id, {"text": "Este grupo no tiene partidas activas."});
								break;
								case "ERR_GAME_NOT_STARTED":
									bot.answerCallbackQuery(msg.id, {"text": "La partida aun no esta iniciada."});
								break;
								case "ERR_USER_ALREADY_RESPONSED":
									bot.answerCallbackQuery(msg.id, {"text": "Todos los jugadores han elegido carta."});
								break;
								default:
									bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
									console.log(res);
								break;
							}
							return;
						}
						var txt = "";
						for (i = 0; i < res.data.players.length; i++){
							txt += res.data.players[i].player_username+"\n";
						}
						bot.sendMessage(msg.message.chat.id, "Aun no han elegido carta:\n"+txt);
					});
				break;
				//Peticion para comprobar quien falta por votar
				case "checkvotes":
					game.checkVotes(data[1], function (res) {
						//Capturamos errores
						if (res.status == "ERR") {
							switch (res.msg) {
								case "ERR_NO_ACTIVE_GAMES":
									bot.answerCallbackQuery(msg.id, {"text": "Este grupo no tiene partidas activas."});
								break;
								case "ERR_GAME_NOT_STARTED":
									bot.answerCallbackQuery(msg.id, {"text": "La partida aun no esta iniciada."});
								break;
								case "ERR_CARDS_UNSENT":
									bot.answerCallbackQuery(msg.id, {"text": "Aun no han elegido carta todos los jugadores."});
								break;
								case "ERR_USER_ALREADY_VOTED":
									bot.answerCallbackQuery(msg.id, {"text": "Ya han votado todos los jugadores."});
								break;
								default:
									bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
									console.log(res);
								break;
							}
							return;
						}
						var txt = "";
						for (i = 0; i < res.data.players.length; i++){
							txt += res.data.players[i].player_username+"\n";
						}
						bot.sendMessage(msg.message.chat.id, "Aun no han votado:\n"+txt);
					});
				break;
				//Comandos de creacion de diccionario
				case "dictionary":
					switch (data[1]){
						//Add collaborators
						case "collab":
							game.db.findOne('dictionaries', {_id: game.db.getObjectId(data[2]), creator_id: res.msg._id, finished: 0}, function(r_dic) {
								if (!r_dic) {
									bot.answerCallbackQuery(msg.id, {"text": "No existe el dicionario."});
									return;
								}
								var opts = {
									reply_markup: {force_reply: true}
								};
								bot.sendMessage(msg.message.chat.id, "Dime el apodo de tu colaborador (@apodo):", opts).then(resp => {
									bot.onReplyToMessage(resp.chat.id, resp.message_id, function (reply){
										game.db.findOne('players', {username: {'$regex': "("+reply.text+")"}}, function (player_res){
											if (!player_res){
												bot.answerCallbackQuery(msg.id, {"text": "No existe ningun usuario con ese nombre."});
												return;
											}
											game.db.count('dictionary_collabs', {collab_id: player_res._id}, function (collab_count){
												if (collab_count){
													bot.answerCallbackQuery(msg.id, {"text": "Ya estas colaborando en un diccionario."});
													return;
												}
												//Se le notifica por privado al colaborador
												bot.sendMessage(player_res.user_id, "El usuario "+res.msg.username+" te ha añadido como colaborador en su diccionario '"+r_dic.name+"'.");
												//Y se le da la posibilidad de añadir cartas
												var opts = {
													reply_markup: JSON.stringify({
														inline_keyboard: [
															[{text: "Añadir cartas blancas", callback_data: "dictionary_addw_"+r_dic._id}],
															[{text: "Añadir cartas negras", callback_data: "dictionary_addb_"+r_dic._id}]
														]
													})
												};
												bot.sendMessage(player_res.user_id, "Se deben añadir al menos "+privatedata.minwhitecards+" cartas blancas y "+privatedata.minblackcards+" cartas negras para completar el diccionario:", opts).then(resp => {
													game.db.insertOne('dictionary_collabs', {msg_id: resp.message_id, dictionary_id: r_dic._id, collab_id: player_res._id, collab_uid: res.msg.user_id, collab_alias: reply.text}, function(){
														bot.sendMessage(msg.message.chat.id, "Se ha añadido a "+reply.text+" como colaborador");
													});
												});
												bot.answerCallbackQuery(msg.id, {"text": "Colaborador añadido."});
											});
										});
										bot.removeReplyListener(resp);
									});
								});
							});
						break;
						//Completar diccionario
						case "end":
							game.db.findOne('dictionaries', {_id: game.db.getObjectId(data[2]), creator_id: res.msg._id, finished: 0}, function(r_dic) {
								if (!r_dic) {
									bot.answerCallbackQuery(msg.id, {"text": "No existe el dicionario."});
									return;
								}
								game.db.count('blackcards', {dictionary: r_dic._id}, function(bca) {
									if (bca < privatedata.minblackcards){
										bot.answerCallbackQuery(msg.id, {"text": "Aun no se ha completado el diccionario de cartas negras."});
										return;
									}
									game.db.count('whitecards', {dictionary: r_dic._id}, function(wca) {
										if (wca < privatedata.minwhitecards){
											bot.answerCallbackQuery(msg.id, {"text": "Aun no se ha completado el diccionario de cartas blancas."});
											return;
										}
										game.db.updateOne('dictionaries', {_id: game.db.getObjectId(r_dic._id)}, {finished: 1}, function (){
											//Enviamos mensaje a los colaboradores y los borramos
											game.db.findMany('dictionary_collabs', {dictionary_id: r_dic._id}, function(collab_res){
												for (var row of collab_res){
													if (row.collab_uid != msg.message.chat.id) bot.editMessageText("El creador ha completado el diccionario.", {chat_id: row.collab_uid, message_id: row.msg_id});
												}
											});
											game.db.remove('dictionary_collabs', {dictionary_id: game.db.getObjectId(r_dic._id)}, function(){});
											//Editamos el mensaje principal
											bot.editMessageText("Se ha completado el diccionario.", {chat_id: r_dic.creator_uid, message_id: r_dic.msg_id});
											bot.answerCallbackQuery(msg.id, {"text": "Diccionario completado."});
										});
									});
								});
							});
						break;
						//Delete dictionary
						case "erase":
							game.db.findOne('dictionaries', {_id: game.db.getObjectId(data[2]), creator_id: res.msg._id, finished: 0}, function(r_dic) {
								if (!r_dic) {
									bot.answerCallbackQuery(msg.id, {"text": "Este diccionario no existe, no es tuyo o ya esta completo."});
									return;
								}
								game.db.remove('dictionaries', {_id: r_dic._id}, function(res){
									if (res.status == "ERR") {
										callback(res);
										return;
									}
									//Enviamos mensaje a los colaboradores
									game.db.findMany('dictionary_collabs', {dictionary_id: r_dic._id}, function(collab_res){
										for (var row of collab_res){
											bot.editMessageText("El creador ha borrado el diccionario.", {chat_id: row.collab_uid, message_id: row.msg_id});
										}
									});
									//Borramos los colaboradores y las cartas
									game.db.remove('dictionary_collabs', {dictionary_id: r_dic._id});
									game.db.remove('whitecards', {dictionary: r_dic._id});
									game.db.remove('blackcards', {dictionary: r_dic._id});
									//Editamos el mensaje principal
									bot.editMessageText("Se ha borrado el diccionario.", {chat_id: r_dic.creator_uid, message_id: r_dic.msg_id});
									bot.answerCallbackQuery(msg.id, {"text": "Diccionario borrado."});
								});
							});
						break;
						//Add white cards
						case "addw":
							game.db.findOne('dictionaries', {_id: game.db.getObjectId(data[2]), finished: 0}, function(r_dic) {
								if (!r_dic) {
									bot.answerCallbackQuery(msg.id, {"text": "No existe el diccionario."});
									return;
								}
								game.db.findOne('dictionary_collabs', {dictionary_id: r_dic._id, collab_id: res.msg._id}, function (collab_res){
									if (!collab_res){
										bot.answerCallbackQuery(msg.id, {"text": "No estas colaborando en este diccionario."});
										return;
									}
									game.db.updateOne('dictionary_collabs', {collab_id: game.db.getObjectId(res.msg._id)}, {status: 1}, function (res){
										var opts = {
											chat_id: collab_res.collab_uid, 
											message_id: collab_res.msg_id,
											reply_markup: JSON.stringify({
												inline_keyboard: [
													[{text: "Dejar de añadir cartas", callback_data: "dictionary_addstop_"+r_dic._id}]
												]
											})
										};
										bot.editMessageText("Añadiendo cartas blancas, debes añadir al menos "+privatedata.minwhitecards+".", opts);
										bot.answerCallbackQuery(msg.id, {"text": "Modo añadir cartas blancas activado."});
									});
								});
							});
						break;
						//Add black cards
						case "addb":
							game.db.findOne('dictionaries', {_id: game.db.getObjectId(data[2]), finished: 0}, function(r_dic) {
								if (!r_dic) {
									bot.answerCallbackQuery(msg.id, {"text": "No existe el diccionario."});
									return;
								}
								game.db.findOne('dictionary_collabs', {dictionary_id: r_dic._id, collab_id: res.msg._id}, function (collab_res){
									if (!collab_res){
										bot.answerCallbackQuery(msg.id, {"text": "No estas colaborando en este diccionario."});
										return;
									}
									game.db.updateOne('dictionary_collabs', {collab_id: game.db.getObjectId(res.msg._id)}, {status: 2}, function (res){
										var opts = {
											chat_id: collab_res.collab_uid, 
											message_id: collab_res.msg_id,
											reply_markup: JSON.stringify({
												inline_keyboard: [
													[{text: "Dejar de añadir cartas", callback_data: "dictionary_addstop_"+r_dic._id}]
												]
											})
										};
										bot.editMessageText("Añadiendo cartas negras, debes añadir al menos "+privatedata.minblackcards+".", opts);
										bot.answerCallbackQuery(msg.id, {"text": "Modo añadir cartas negras activado."});
									});
								});
							});
						break;
						//Stop adding cards
						case "addstop":
							game.db.findOne('dictionaries', {_id: game.db.getObjectId(data[2]), finished: 0}, function(r_dic) {
								if (!r_dic) {
									bot.answerCallbackQuery(msg.id, {"text": "No existe el diccionario."});
									return;
								}
								game.db.findOne('dictionary_collabs', {dictionary_id: r_dic._id, collab_id: res.msg._id}, function(collab_res){
									if (!collab_res){
										bot.answerCallbackQuery(msg.id, {"text": "No estas colaborando en este diccionario."});
										return;
									}
									if (collab_res.status == 0){
										bot.answerCallbackQuery(msg.id, {"text": "No estas agregando cartas al diccionario."});
										return;
									}
									game.db.updateOne('players', {_id: game.db.getObjectId(res.msg._id)}, {status: 0}, function (res){
										var opts = {
											chat_id: collab_res.collab_uid, 
											message_id: collab_res.msg_id,
											reply_markup: JSON.stringify({
												inline_keyboard: [
													[{text: "Añadir cartas blancas", callback_data: "dictionary_addw_"+r_dic._id}],
													[{text: "Añadir cartas negras", callback_data: "dictionary_addb_"+r_dic._id}]
												]
											})
										};
										bot.editMessageText("Se deben añadir al menos "+privatedata.minwhitecards+" cartas blancas y "+privatedata.minblackcards+" cartas negras para completar el diccionario:", opts);
										bot.answerCallbackQuery(msg.id, {"text": "Modo añadir cartas desactivado."});
									});
								});
							});
						break;
					}
				break;
				default:
					bot.answerCallbackQuery(msg.id, {"text": "ERROR: Opción incorrecta."});
				break;
			}
		});
	});
	//Si el comando es /newdictionary
	bot.onText(new RegExp("^\\/newdictionary(?:@"+privatedata.botalias+")?", "i"), (msg, match) => { 
		//Detectamos si el mensaje recibido es por privado
		if (msg.chat.type != "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por privado.");
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
			//Buscamos en la tabla diccionarios si creador ya tiene una
			game.db.count('dictionary_collabs', {collab_id: res.msg._id}, function(r_dic) {
				if (r_dic) {
					bot.sendMessage(msg.chat.id, "Un usuario solo puede crear un diccionario a la vez.");
					return;
				}
				var opts = {
					reply_markup: {force_reply: true}
				};
				bot.sendMessage(msg.chat.id, "Creando diccionario...\nDime el nombre que deseas ponerle:", opts).then(resp => {
					bot.onReplyToMessage(resp.chat.id, resp.message_id, function (reply){
						//Buscamos en la tabla diccionarios si el nombre ya existe.
						game.db.count('dictionaries', {name: reply.text}, function(n_dic) {
							if (n_dic) {
								bot.sendMessage(msg.chat.id, "Ya existe un diccionario con ese nombre.");
								return;
							}		
							//Añadimos el diccionario a la BD
							game.db.insertOne('dictionaries', {creator_id: res.msg._id, creator_uid: res.msg.user_id, creator_name: res.msg.username, name: reply.text, finished: 0}, function(res_dicc){							
								//Enviamos un mensaje con las opciones de creador
								var opts = {
									reply_markup: JSON.stringify({
										inline_keyboard: [
											[{text: "Añadir colaborador", callback_data: "dictionary_collab_"+res_dicc.insertedId}],
											[{text: "Completar diccionario", callback_data: "dictionary_end_"+res_dicc.insertedId}],
											[{text: "Borrar el diccionario", callback_data: "dictionary_erase_"+res_dicc.insertedId}]
										]
									})
								};
								bot.sendMessage(msg.chat.id, "Se ha creado el diccionario ahora puedes realizar las siguientes acciones:", opts).then(dic_response => {
									//Añadimos el ID del mensaje original
									game.db.updateOne('dictionaries', {_id: res_dicc.insertedId}, {msg_id: dic_response.message_id}, function(r){
										if (r.status == "ERR") {
											callback(r);
											return;
										}
									});
									//Enviamos otro mensaje con las opciones para añadir cartas
									var opts = {
										reply_markup: JSON.stringify({
											inline_keyboard: [
												[{text: "Añadir cartas blancas", callback_data: "dictionary_addw_"+res_dicc.insertedId}],
												[{text: "Añadir cartas negras", callback_data: "dictionary_addb_"+res_dicc.insertedId}]
											]
										})
									};
									bot.sendMessage(msg.chat.id, "Se deben añadir al menos "+privatedata.minwhitecards+" cartas blancas y "+privatedata.minblackcards+" cartas negras para completar el diccionario:", opts).then(collab_response => {
										//Añadimos al creador como colaborador
										game.db.insertOne('dictionary_collabs', {msg_id: collab_response.message_id, dictionary_id: res_dicc.insertedId, collab_id: res.msg._id, collab_uid: res.msg.user_id, collab_alias: res.msg.username}, function(res){
											if (res.status == "ERR") {
												callback(res);
												return;
											}
										});
									});
								});
							});
						});
						bot.removeReplyListener(resp);
					});
				});
			});
		});
	});

	//Si el comando es /listdicionaries
	bot.onText(new RegExp("^\\/listdictionaries(?:@"+privatedata.botalias+")?", "i"), (msg, match) => {
		//Buscamos en la tabla diccionarios
		game.db.findMany('dictionaries', {finished:1}, function(r_dic) {
			if (!r_dic.length) {
				bot.sendMessage(msg.chat.id, "No hay ningun diccionario.");
				return;
			}
			var text = "";
			for (i=0; i< r_dic.length; i++){
				text += r_dic[i].name+" de "+r_dic[i].creator_name+"\n";
			}
			bot.sendMessage(msg.chat.id, "Puedes usar cualquiera de estos diccionarios: \n"+text);
		});
	});

	//Add cards (si el comando no empieza por /)
	bot.onText(new RegExp("^(?!\/).+", "i"), (msg, match) => {
		//Detectamos si el mensaje recibido es por privado
		if (msg.chat.type != "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por privado.");
			return;
		}
		var cardText = match[0];
		game.getUser(msg.from.id, function (res){
			//Capturamos errores
			if (res.status == "ERR") {
				switch (res.msg) {
					case "ERR_NOT_IN_GAME":
						bot.answerCallbackQuery(msg.id, {"text": "Debes hablar conmigo (@"+privatedata.botalias+") por privado y mandar el mensaje /start."});
					break;
					default:
						bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
						console.log(res);
					break;
				}
				return;
			}
			game.db.findOne('dictionary_collabs', {collab_id: res.msg._id}, function(collab_res) {
				if (!collab_res) return; //No está añadiendo cartas, el mensaje se ignora.
				if (collab_res.status == 1){ //white
					//Buscamos en la tabla diccionarios si el nombre ya existe.
					game.db.findOne('dictionaries', {_id: game.db.getObjectId(collab_res.dictionary_id), finished: 0}, function(r_dic) {
						if (!r_dic) {
							bot.sendMessage(msg.chat.id, "El diccionario a completar no existe.");
							return;
						}
						//Buscamos en la tabla diccionarios si el nombre ya existe.
						game.db.count('whitecards', {dictionary: r_dic._id}, function(n_dic) {
							game.db.insertOne('whitecards', {card_text: cardText, dictionary: r_dic._id}, function(){
								//se le notifica por privado
								bot.sendMessage(msg.from.id, "Se ha añadido la carta. Llevas "+(n_dic+1)+" cartas blancas.");
								if (res.msg._id != r_dic.creator_id) 
									bot.sendMessage(r_dic.creator_uid, msg.from.username+" ha añadido la carta blanca "+(n_dic+1)+": "+cardText);
								
							});
						});
					});
				} else if (collab_res.status == 2){ //black
					//Buscamos en la tabla diccionarios si el nombre ya existe.
					game.db.findOne('dictionaries', {_id: game.db.getObjectId(collab_res.dictionary_id), finished: 0}, function(r_dic) {
						if (!r_dic) {
							bot.sendMessage(msg.chat.id, "El diccionario a completar no existe.");
							return;
						}
						//Buscamos en la tabla diccionarios si el nombre ya existe.
						game.db.count('blackcards', {dictionary: r_dic._id}, function(n_dic) {
							game.db.insertOne('blackcards', {card_text: cardText, dictionary: r_dic._id}, function(){
								bot.sendMessage(msg.from.id, "Se ha añadido la carta. Llevas "+(n_dic+1)+" cartas negras.");
								if (res.msg._id != r_dic.creator_id) 
									bot.sendMessage(r_dic.creator_uid, msg.from.username+" ha añadido la carta negra "+(n_dic+1)+": "+cardText);
							});
						});
					});
				} else {
					//No está añadiendo cartas, el mensaje se ignora.
				}
			});
		});
	});

	//Si el comando es /rememberMessage
	bot.onText(new RegExp("^\\/rememberMessage(?:@"+privatedata.botalias+")?", "i"), (msg, match) => {
		//Detectamos si el mensaje recibido es por grupo
		if (msg.chat.type == "private") {
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
			return;
		}
		game.getUser(msg.from.id, function (res){
			//Capturamos errores
			if (res.status == "ERR") {
				switch (res.msg) {
					case "ERR_NOT_IN_GAME":
						bot.answerCallbackQuery(msg.id, {"text": "Debes hablar conmigo (@"+privatedata.botalias+") por privado y mandar el mensaje /start."});
					break;
					default:
						bot.answerCallbackQuery(msg.id, {"text": "Error inesperado."});
						console.log(res);
					break;
				}
				return;
			}
			//Recuperamos el mensaje de la partida
			game.db.findOne('games', {room_id: msg.chat.id}, function(r_games) {
				if (!r_games) {
					bot.sendMessage(msg.chat.id, "No hay ninguna partida creada.");
					return;
				}
				var options = [
					[{text: "Borrar la partida", callback_data: "delete_"+r_games._id}],
					[{text: "Consultar cartas", callback_data: "checkcards_"+r_games._id}]
				];
				if (r_games.type=="democracia"){
					options.push([{text: "Consultar votos", callback_data: "checkvotes_"+r_games._id}]);
				}
				var opts = {
					reply_markup: JSON.stringify({
						inline_keyboard: options
					})
				};
				bot.deleteMessage(r_games.room_id, r_games.msg_id);
				bot.sendMessage(r_games.room_id, "Mensaje principal recuperado.", opts).then(resp => {
			    	game.modifyGame(r_games._id, {msg_id: resp.message_id}, function(game_res){
						//Capturamos errores
						if (game_res.status == "ERR") {
							switch (game_res.msg) {
								case "ERR_BAD_GAME":
									bot.sendMessage(msg.chat.id, "Este grupo no tiene partida activa o la partida ya esta iniciada.");
								break;
								case "ERR_NOT_CREATOR_CONFIG":
									bot.sendMessage(msg.chat.id, "Solo el creador puede configurar la partida.");
								break;
								default:
									bot.sendMessage(msg.chat.id, "Error inesperado.");
									console.log(game_res);
								break;
							}
							return;
						}
		    		});
			    });
			});
		});
	});

	//Send message to users
	bot.onText(new RegExp("^\\/sendMessage(?:@"+privatedata.botalias+")?\\s(.*)", "i"), (msg, match) => {
		if (msg.chat.type == "private") {
			if (msg.chat.id == privatedata.ownerid) {
				game.db.findMany('players', {}, function(r_pla) {
					if(r_pla.length){
						var users = "";
						for (i = 0; i < r_pla.length; i++){
							bot.sendMessage(r_pla[i].user_id, match[1]);
							users += " " + r_pla[i].username + " ";
						}
						bot.sendMessage(msg.chat.id, "Mensaje enviado a: " + users);
					} else bot.sendMessage(msg.chat.id, "No hay usuarios.");
				});
			} else bot.sendMessage(msg.chat.id, "Solo @"+privatedata.owneralias+" puede usar este comando.");
		} else bot.sendMessage(msg.chat.id, "Por favor envia este comando por privado.");
	});

	//Deletes all the games
	bot.onText(new RegExp("^\\/resetGames(?:@"+privatedata.botalias+")?", "i"), (msg, match) => {
		if (msg.chat.type == "private") {
			if (msg.chat.id == privatedata.ownerid) {
				game.db.remove('games', {});
				game.db.remove('playersxgame', {});
				game.db.remove('wcardsxgame', {});
				game.db.remove('bcardsxgame', {});
				game.db.remove('cardsxround', {});
				game.db.remove('votesxround', {});
				game.db.remove('votedeletexgame', {});
				game.db.findMany('players', {}, function(r_pla) {
					if(r_pla.length){
						var users = "";
						for (i = 0; i < r_pla.length; i++){
							bot.sendMessage(r_pla[i].user_id, "Todas las partidas han sido reiniciadas debido a tareas de mantenimiento en la base de datos. Perdonen los inconvenientes.");
							users += " " + r_pla[i].username + " ";
						}
						bot.sendMessage(msg.chat.id, "Mensaje enviado a: " + users);
					} else bot.sendMessage(msg.chat.id, "No hay usuarios.");
				});
			} else bot.sendMessage(msg.chat.id, "Solo @"+privatedata.owneralias+" puede usar este comando.");
		} else bot.sendMessage(msg.chat.id, "Por favor envia este comando por privado.");
	});

	//Show the help message
	bot.onText(new RegExp("^\/help(?:@"+privatedata.botalias+")?$", "i"), (msg, match) => {
		bot.sendMessage(msg.chat.id, 
			"Bienvenido a la ayuda de "+privatedata.botname+" versión "+privatedata.botversion+".\n"+
			"Puedes consultar la ayuda en el siguiente enlace: http://telegra.ph/Manual-del-bot-Cartas-Contra-la-Humanidad-cclhbot-01-31\n"+
			"Disfrutad del bot y... ¡A jugar!"+
			"Creado por @"+privatedata.owneralias+"."
		);
	});
});

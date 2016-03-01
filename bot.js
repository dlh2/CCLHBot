//Cargamos los modulos necesarios y las bases de datos de cartas
var TelegramBot = require('node-telegram-bot-api');
var mongodb = require('mongodb');
var autoIncrement = require("mongodb-autoincrement");
var whitecards = require('./whitecards');
var blackcards = require('./blackcards');
var privatedata = require('./privatedata');
//Iniciamos el bot y mongodb
var bot = new TelegramBot(privatedata.token, {polling: true});
var MongoClient = mongodb.MongoClient;
autoIncrement.setDefaults({
    step: 1						// auto increment step
});

///////////////////////////FUNCIONES///////////////////////////////////
//Genera un numero aleatorio
function aleatorio(a,b) {
	return Math.round(Math.random()*(b-a)+parseInt(a));
}
//Reordena un array aleatoriamente
function shuffle(o){
    for(var j, x, i = o.length; i; j = Math.floor(Math.random() * i), x = o[--i], o[i] = o[j], o[j] = x);
    return o;
}
//Busca una partida por usuario
function searchbyuser(array, key){
  return obj = array.filter(function ( obj ) {
      return obj.user_id === key;
  })[0];
}
//Busca los usuarios que pertenecen a x partida
function searchbygame(array, key){
  return obj = array.filter(function ( obj ) {
      return obj.game_id === key;
  });
}
//Obtiene los votos
function getVotes(array){
	return array.reduce( function(a, b){
        return a + b['votes'];
    }, 0);
}
//Obtiene el maximo
function getMax(array){
	var res = Math.max.apply(Math,array.map(function(o){return o.votes;}));
	return array.filter(function(o){ return o.votes == res; });
}
//
function repartirCartas(game, players, excluded_id){
	//En caso de que se haya podido actualizar correctamente se envia esta carta al grupo y a todos los miembros
	bot.sendMessage(game.room_id, game.blackcards[game.currentblack]);
	for (i = 0; i < players.length; i++){
		var buttonarray = [];
		var cardstext = "";
			for (j = 0; j < 5;j+=2){
				if (j < 4) buttonarray.push(["/"+j+" "+players[i].cards[j], "/"+(j+1)+" "+players[i].cards[j+1]]);
				else buttonarray.push(["/"+j+" "+players[i].cards[j]]);
				cardstext += j+". "+players[i].cards[j]+"\n";
				if (j < 4) cardstext += (j+1)+". "+players[i].cards[j+1]+"\n";
			}
			var opts = {
			  reply_markup: JSON.stringify({
				keyboard: buttonarray,
				one_time_keyboard: true
			  })
			};
		//Y ademas se envian las otras cartas con un teclado para elegir la opcion deseada a los miembros
		if (game.type=="dictadura"){
			if (players[i].user_id != excluded_id) bot.sendMessage(players[i].user_id, game.blackcards[game.currentblack]+"\nElige una opcion:\n "+cardstext, opts);
		} else if (game.type=="clasico"){
			if (players[i].user_id != excluded_id) bot.sendMessage(players[i].user_id, game.blackcards[game.currentblack]+"\nElige una opcion:\n "+cardstext, opts);
		} else if (game.type=="democracia"){
			bot.sendMessage(players[i].user_id, game.blackcards[game.currentblack]+"\nElige una opcion:\n "+cardstext, opts);
		} else bot.sendMessage(game.room_id, "Error inesperado en el tipo.");
	}
}
function nuevaRonda(db, game, winner_id, winner_username, winner_points){
	if (winner_points+1 == game.num_cardstowin){
		setTimeout(function(){bot.sendMessage(winner_id, "Has ganado la partida.");}, 300);
		setTimeout(function(){bot.sendMessage(game.room_id, winner_username+" ha ganado la partida.");}, 300);
		//Borramos la partida
		db.collection('games').deleteOne({room_id: game.room_id}, function(err, result5) {
			if (err) {
				bot.sendMessage(game.room_id, "Se ha producido un error al borrar en la tabla.");
				console.log(err);
			} else {
				if (result5.result.ok == 1) {
					//Si se ha borrado correctamente borramos tambien los jugadores que estuvieran inscritos en ella.
					db.collection('playersxgame').remove({game_id: game.game_id}, function(err, result6) {
						if (err) {
							bot.sendMessage(game.room_id, "Se ha producido un error al borrar en la tabla.");
							console.log(err);
						} else {
							db.collection('cardsxgame').remove({game_id: game.game_id}, function(err, result7) {
								if (err) {
									bot.sendMessage(game.room_id, "Se ha producido un error al borrar en la tabla.");
									console.log(err);
								} else {
									//Y enviamos el resultado por el grupo.
									if (result7.result.ok != 1) bot.sendMessage(game.room_id, "Se ha producido un error al borrar en la tabla.");
								}
								db.close();
							});
						}
					});
				} else bot.sendMessage(game.room_id, "Se ha producido un error al borrar en la tabla.");
			}
		});
	} else if (winner_points+1 < game.num_cardstowin) {
		db.collection('playersxgame').updateOne({user_id: winner_id}, {$set: { "points": (parseInt(winner_points)+1)}}, function(err, result5) {
			if (err) {
				bot.sendMessage(game.room_id, "Se ha producido un error al borrar en la tabla.");
				console.log(err);
			} else {
				//Si nada ha ido correctamente
				if (result5.result.ok != 1) bot.sendMessage(game.room_id, "Error inesperado.");
				else {
					db.collection('cardsxgame').remove({game_id: game.game_id}, function(err, result7) {
						if (err) {
							bot.sendMessage(game.room_id, "Se ha producido un error al borrar en la tabla.");
							console.log(err);
						} else {
							//Y enviamos el resultado por el grupo.
							if (result7.result.ok != 1) bot.sendMessage(game.room_id, "Se ha producido un error al borrar en la tabla.");
							else {
								db.collection('games').updateOne({"room_id" : game.room_id},
									{$set: {"currentblack": (parseInt(game.currentblack)+1)}}, function(err, result8) {
										if (err) {
											bot.sendMessage(game.room_id, "Se ha producido un error al modificar la tabla.");
											console.log(err);
										} else {
											if (result8.result.ok == 1){
												db.collection('playersxgame').find({game_id: game.game_id}).toArray(function (err, result9) {
													if (err) {
														bot.sendMessage(game.room_id, "Se ha producido un error al buscar en la tabla.");
														console.log(err);
													} else {
														if (game.type=="dictadura"){
															repartirCartas(game, result9, game.creator_id);
														} else if (game.type=="clasico"){
															var dictador = 0;
															if (parseInt(game.dictator_id)+1 < result9.length)dictador = parseInt(game.dictator_id)+1;
															else dictador = 0;
															db.collection('playersxgame').find({uid: dictador}).toArray(function (err, result10) {
																if (err) {
																	bot.sendMessage(game.room_id, "Se ha producido un error al buscar en la tabla.");
																	console.log(err);
																} else {
																	//console.log(result10.length);
																	if (result10.length == 1){
																		db.collection('games').updateOne({"room_id" : game.room_id},
																			{$set: {"dictator_id": dictador, "dictator_uid": result10[0].user_id}}, function(err, result11) {
																			if (err) {
																				bot.sendMessage(game.room_id, "Se ha producido un error al modificar la tabla.");
																				console.log(err);
																			} else {
																				if (result11.result.ok == 1){
																					repartirCartas(game, result9, result10[0].user_id);
																				} else bot.sendMessage(game.room_id, "Se ha producido un error al modificar tabla.");
																			}
																			db.close();
																		});
																	}
																}
															});
														} else if (game.type=="democracia"){
															repartirCartas(game, result9);
														} else bot.sendMessage(game.room_id, "Error inesperado en el tipo.");
													}
												});
											} else bot.sendMessage(game.room_id, "Se ha producido un error al modificar la tabla.");
										}
								});
							}
						}
					});
				}
			}
		});
	} else bot.sendMessage(game.room_id, "Error inesperado.");
}

//////////////////////////////EVENTOS//////////////////////////////
bot.on('text', function (msg) {
	//detectamos si el mensaje recibido es por un grupo
	if (msg.chat.id < 0) {
		//Si el parametro es /create...
		if (msg.text.indexOf("/create") == 0){
			//y sus parametros son  numero_de_players
			//\s(dictadura|clasico|democracia)
			//numero_de_players-> \s([2-9])
			//numero_de_rondas-> \s([1-5])
			if (/^\/create(?:@cclhbot)?\s(dictadura|clasico|democracia)\s([2-9])\s([1-5])/i.test(msg.text)) {
				res = msg.text.match(/^\/create(?:@cclhbot)?\s(dictadura|clasico|democracia)\s([2-9])\s([1-5])/i);
				//Conectamos con la BD
				MongoClient.connect(privatedata.url, function (err, db) {
					if (err) bot.sendMessage(msg.chat.id, "No se ha podido conectar a la base de datos");
					else {
						//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
						db.collection('games').find({room_id: msg.chat.id}).toArray(function (err, result) {
							if (err) {
								bot.sendMessage(msg.chat.id, "Se ha producido un error al buscar en la tabla.");
								console.log(err);
							} else if (result.length) bot.sendMessage(msg.chat.id, "Este grupo ya tiene una partida activa, su creador puede borrarla con /delete");
							else {
								db.collection('playersxgame').find({user_id: msg.from.id}).toArray(function (err, result3) {
									if (err) {
										bot.sendMessage(msg.chat.id, "Se ha producido un error al buscar en la tabla.");
										console.log(err);
									} else {
										if (!result3.length){
											//Se genera un identificador para la partida
											var base_36 = aleatorio(10000,99000).toString(36);
											//En caso de que no exista se crea la partida
											whitecardsarray = shuffle(whitecards.list);
											blackcardsarray = shuffle(blackcards.list);
											db.collection('games').insertOne({game_id: base_36, room_id: msg.chat.id, creator_id: msg.from.id, dictator_id: 0, dictator_uid: msg.from.id, type: res[1], num_participants: res[2], num_cardstowin: res[3], whitecards: whitecardsarray, blackcards: blackcardsarray, currentblack: 0}, function (err, result2) {
												if (err) {
													bot.sendMessage(msg.chat.id, "Se ha producido un error al insertar en la tabla.");
													console.log(err);
												} else {
													//creamos el nombre
													var name = msg.from.first_name;
													if(typeof msg.from.last_name != "undefined") name += " "+msg.from.last_name;
													if(typeof msg.from.username != "undefined") name += " (@"+msg.from.username+")";
													db.collection('playersxgame').insertOne({uid: 0, game_id: base_36, user_id: msg.from.id, username: name, points: 0, cards:whitecardsarray.slice(0, 45)}, function (err, result3) {
														if (err) {
															bot.sendMessage(msg.chat.id, "Se ha producido un error al insertar en la tabla.");
															console.log(err);
														} else {
															//Y se le notifica por privado
															setTimeout(function(){bot.sendMessage(msg.chat.id, name+" se ha unido a la partida");}, 1000);
															bot.sendMessage(msg.from.id, "Te has unido a la partida.");
														}
														db.close();
													});
												}
											});
											//Y finalmente se envia la informacion al grupo.
											bot.sendMessage(msg.chat.id, "Se ha creado la sala, ahora escribeme por privado (a @cclhbot) lo siguiente:");
											setTimeout(function(){bot.sendMessage(msg.chat.id, "/join "+base_36)}, 500);
										} else bot.sendMessage(msg.chat.id, "Ya estas participando en otra partida.");
									}
								});
							}
						});
					}
				});
			} else bot.sendMessage(msg.chat.id, "Sintaxis incorrecta. Puedes escribir el comando /help para obtener informacion sobre los parametros.");
		}
		//Si el parametro es /create...
		else if (msg.text.indexOf("/delete") == 0){
			//Con 0 parametros
			if (/^\/delete(?:@cclhbot)?/i.test(msg.text)) {
				//Conectamos con la BD
				MongoClient.connect(privatedata.url, function (err, db) {
					if (err) bot.sendMessage(msg.chat.id, "No se ha podido conectar a la base de datos");
					else {
						//Buscamos en la tabla games si el grupo desde el que se invoca tiene una partida.
						db.collection('games').find({room_id: msg.chat.id}).toArray(function (err, result) {
							if (err) {
								bot.sendMessage(msg.chat.id, "Se ha producido un error al buscar en la tabla.");
								console.log(err);
							} else if (result.length) {
								//En el caso de que tenga una partida comprueba que el usuario que la borra es el mismo que la creo.
								if (result[0].creator_id == msg.from.id){
									//Borramos la partida
									db.collection('games').deleteOne({room_id: msg.chat.id}, function(err, results) {
										if (err) {
											bot.sendMessage(msg.chat.id, "Se ha producido un error al borrar en la tabla.");
											console.log(err);
										} else {
											if (results.result.ok == 1) {
												//Si se ha borrado correctamente borramos tambien los jugadores que estuvieran inscritos en ella.
												db.collection('playersxgame').remove({game_id: result[0].game_id}, function(err, results) {
													if (err) {
														bot.sendMessage(msg.chat.id, "Se ha producido un error al borrar en la tabla.");
														console.log(err);
													} else {
														db.collection('cardsxgame').remove({game_id: result[0].game_id}, function(err, results) {
															if (err) {
																bot.sendMessage(msg.chat.id, "Se ha producido un error al borrar en la tabla.");
																console.log(err);
															} else {
																//Y enviamos el resultado por el grupo.
																if (results.result.ok == 1) bot.sendMessage(msg.chat.id, "Se ha borrado la partida.");
																else bot.sendMessage(msg.chat.id, "Se ha producido un error al borrar en la tabla.");
															}
															db.close();
														});
													}
												});
											} else bot.sendMessage(msg.chat.id, "Se ha producido un error al borrar en la tabla.");
										}
									});
								} else bot.sendMessage(msg.chat.id, "Solo el creador puede borrar la partida.");
							} else bot.sendMessage(msg.chat.id, "Este grupo no tiene partidas activas.");
						});
					}
				});
			} else bot.sendMessage(msg.chat.id, "Sintaxis incorrecta. Puedes escribir el comando /help para obtener informacion sobre los parametros.");
		}
		//Si el parametro es /start...
		else if (msg.text.indexOf("/start") == 0){
			//Con 0 parametros
			if (/^\/start(?:@cclhbot)?/i.test(msg.text)) {
				//Conectamos con la BD
				MongoClient.connect(privatedata.url, function (err, db) {
					if (err) bot.sendMessage(msg.chat.id, "No se ha podido conectar a la base de datos");
					else {
						//Buscamos en la tabla games si el grupo desde el que se invoca tiene una partida.
						db.collection('games').find({room_id: msg.chat.id}).toArray(function (err, result) {
							if (err) {
								bot.sendMessage(msg.chat.id, "Se ha producido un error al buscar en la tabla.");
								console.log(err);
							} else if (result.length) {
								//En caso de que tenga una partida comprobamos que aun no este iniciada
								if (!result[0].currentblack) {
									//Comprobamos que el que inicia la partida sea el creador
									if (result[0].creator_id == msg.from.id){
										//Y comprobamos que haya inscritos el numero de jugadores especificado en el comando /create
										db.collection('playersxgame').find({game_id: result[0].game_id}).toArray(function (err, result2) {
											if (err) {
												bot.sendMessage(msg.chat.id, "Se ha producido un error al buscar en la tabla.");
												console.log(err);
											} else {
												//Comprobamos que la partida este llena
												if (result2.length == result[0].num_participants){
													//Si es asi se actualiza la carta negra actual a 1 para comenzar con el juego.
													db.collection('games').updateOne({ "room_id" : msg.chat.id },
														{$set: { "currentblack": (parseInt(result[0].currentblack)+1) }}, function(err, results) {
															if (err) {
																bot.sendMessage(msg.chat.id, "Se ha producido un error al modificar la tabla.");
																console.log(err);
															} else {
																if (results.result.ok == 1){
																	//En caso de que se haya podido actualizar correctamente se envia esta carta al grupo y a todos los miembros
																	bot.sendMessage(msg.chat.id, result[0].blackcards[result[0].currentblack]);
																	for (i = 0; i < result2.length; i++){
																		var buttonarray = [];
																		var cardstext = "";
																			for (j = 0; j < 5;j+=2){
																				if (j < 4) buttonarray.push(["/"+j+" "+result2[i].cards[j], "/"+(j+1)+" "+result2[i].cards[j+1]]);
																				else buttonarray.push(["/"+j+" "+result2[i].cards[j]]);
																				cardstext += j+". "+result2[i].cards[j]+"\n";
																				if (j < 4) cardstext += (j+1)+". "+result2[i].cards[j+1]+"\n";
																			}
																			var opts = {
																			  reply_markup: JSON.stringify({
																				keyboard: buttonarray,
																				one_time_keyboard: true
																			  })
																			};
																		//Y ademas se envian las otras cartas con un teclado para elegir la opcion deseada a los miembros
																		if (result[0].type=="dictadura"){
																			if (result2[i].user_id != result[0].creator_id) bot.sendMessage(result2[i].user_id, result[0].blackcards[result[0].currentblack]+"\nElige una opcion:\n "+cardstext, opts);
																		} else if (result[0].type=="clasico"){
																			if (result2[i].user_id != result[0].dictator_uid) bot.sendMessage(result2[i].user_id, result[0].blackcards[result[0].currentblack]+"\nElige una opcion:\n "+cardstext, opts);
																		} else if (result[0].type=="democracia"){
																			bot.sendMessage(result2[i].user_id, result[0].blackcards[result[0].currentblack]+"\nElige una opcion:\n "+cardstext, opts);
																		} else bot.sendMessage(msg.chat.id, "Error inesperado en el tipo.");
																	}
																} else bot.sendMessage(msg.chat.id, "Se ha producido un error al modificar la tabla.");
															}
													});
												} else bot.sendMessage(msg.chat.id, "Aun no se ha llenado la partida. "+result2.length+" de "+result[0].num_participants+" participantes");
											}
										});
									} else bot.sendMessage(msg.chat.id, "Solo el creador puede iniciar la partida.");
								} else bot.sendMessage(msg.chat.id, "La partida ya esta iniciada.");
							} else bot.sendMessage(msg.chat.id, "No existe la partida especificada.");
						});
					}
				});
			} else bot.sendMessage(msg.chat.id, "Sintaxis incorrecta. Puedes escribir el comando /help para obtener informacion sobre los parametros.");
		//Si el parametro es /join pedimos al usuario que lo envie por privado
		} else if (msg.text.indexOf("/join") == 0){
			bot.sendMessage(msg.chat.id, "Por favor enviame ese comando por privado.");
		} else if (msg.text.indexOf("/version") == 0){
			bot.sendMessage(msg.chat.id, "Versión 0.2. Creado por @themarioga");
		}
	} else { //detectamos si el mensaje recibido es por privado
		//Si el parametro es /start ha dado permisos al bot para hablarle por privado
		if (msg.text.indexOf("/start") == 0){
			bot.sendMessage(msg.chat.id, "Gracias por unirte al juego de Cartas contra la humanidad para telegram!");
		}
		//Si el parametro es /create pedir que se envie por el grupo
		if (msg.text.indexOf("/create") == 0){
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por el grupo");
		}
		//Si el parametro es /delete pedir que se envie por el grupo
		if (msg.text.indexOf("/delete") == 0){
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por el grupo");
		}
		//Si el parametro es /delete pedir que se envie por el grupo
		if (msg.text.indexOf("/start") == 0){
			bot.sendMessage(msg.chat.id, "Por favor envia este comando por el grupo");
		}
		//Si el parametro es /join...
		else if (msg.text.indexOf("/join") == 0){
			//Pasandole como parametro el ID de la partida
			if (/^\/join(?:@cclhbot)?\s(.*)/i.test(msg.text)) {
				res = msg.text.match(/^\/join(?:@cclhbot)?\s(.*)/i);
				//Conectamos con la BD
				MongoClient.connect(privatedata.url, function (err, db) {
					if (err) bot.sendMessage(msg.chat.id, "No se ha podido conectar a la base de datos");
					else {
						//Buscamos en la tabla juegos si el juego con la ID pasada por parametro existe
						db.collection('games').find({game_id: res[1]}).toArray(function (err, result) {
							if (err) {
								bot.sendMessage(msg.chat.id, "Se ha producido un error al buscar en la tabla.");
								console.log(err);
							} else if (result.length) {
								//En caso de que exista obtenemos todos los jugadores conectados
								db.collection('playersxgame').find().toArray(function (err, result2) {
									if (err) {
										bot.sendMessage(msg.chat.id, "Se ha producido un error al buscar en la tabla.");
										console.log(err);
									} else {
										//Comprobamos que la partida no este llena
										var players = searchbygame(result2, res[1]).length;
										if (players < result[0].num_participants){
											var playergame = searchbyuser(result2, msg.from.id);
											//Y que el jugador no este en ninguna partida actualmente
											if (!playergame){
												//Y si no esta lo añadimos a la partida
												if (err) {
													bot.sendMessage(msg.chat.id, "Se ha producido un error al insertar en la tabla.");
													console.log(err);
												} else {
													//creamos el nombre
													var name = msg.from.first_name;
													if(typeof msg.from.last_name != "undefined") name += " "+msg.from.last_name;
													if(typeof msg.from.username != "undefined") name += " (@"+msg.from.username+")";
													db.collection('playersxgame').insertOne({uid: players, game_id: res[1], user_id: msg.from.id, username: name, points: 0, cards:result[0].whitecards.slice(result2.length*45, result2.length*45+45)}, function (err, result3) {
														if (err) {
															bot.sendMessage(msg.chat.id, "Se ha producido un error al insertar en la tabla.");
															console.log(err);
														} else {
															//Y se le notifica por privado
															bot.sendMessage(result[0].room_id, name+" se ha unido a la partida");
															bot.sendMessage(msg.from.id, "Te has unido a la partida.");
														}
														db.close();
													});
												}
											} else if (playergame.game_id == res[1]) bot.sendMessage(msg.chat.id, "Ya estas jugando esta partida.");
											else bot.sendMessage(msg.chat.id, "Ya estas jugando otra partida.");
										} else bot.sendMessage(msg.chat.id, "La partida esta llena, no puedes unirte.");
									}
								});
							} else bot.sendMessage(msg.chat.id, "No existe la partida especificada.");
						});
					}
				});
			} else bot.sendMessage(msg.chat.id, "Sintaxis incorrecta. Puedes escribir el comando /help para obtener informacion sobre los parametros.");
		} else if (msg.text.indexOf("/vote") == 0){
			//Pasandole como parametro el ID de la partida
			if (/^\/vote\_([0-9]+)\s(.*)/i.test(msg.text)) {
				res = msg.text.match(/^\/vote\_([0-9]+)\s(.*)/i);
				var opts = {
				  reply_markup: JSON.stringify({
					hide_keyboard: true
				  })
				};
				//Conectamos con la BD
				MongoClient.connect(privatedata.url, function (err, db) {
					if (err) bot.sendMessage(msg.chat.id, "No se ha podido conectar a la base de datos");
					else {
						//Buscamos al jugador en la lista de jugadores
						db.collection('playersxgame').find({user_id: msg.from.id}).toArray(function (err, result) {
							if (err) {
								bot.sendMessage(msg.chat.id, "Se ha producido un error al buscar en la tabla.");
								console.log(err);
							} else {
								//Comprobamos que este jugando alguna partida
								if (result.length){
									//Buscamos la partida
									db.collection('games').find({game_id: result[0].game_id}).toArray(function (err, result2) {
										if (err) {
											bot.sendMessage(msg.chat.id, "Se ha producido un error al buscar en la tabla.");
											console.log(err);
										} else if (result2.length) { //Comprobamos que la partida aun exista
											db.collection('cardsxgame').find({_id: parseInt(res[1])}).toArray(function (err, result3) {
												if (err) {
													bot.sendMessage(msg.chat.id, "Se ha producido un error al buscar en la tabla.");
													console.log(err);
												} else if (result3.length) { //Comprobamos que la carta exista
													db.collection('playersxgame').find({user_id: result3[0].user_id}).toArray(function (err, result4) {
														if (err) {
															bot.sendMessage(msg.chat.id, "Se ha producido un error al buscar en la tabla.");
															console.log(err);
														} else if (result4.length) { //Comprobamos que el usuario exista
															bot.sendMessage(msg.chat.id, "Has votado: "+res[2], opts);
															if (result2[0].type=="dictadura"){
																if (msg.chat.id == result2[0].creator_id){
																	bot.sendMessage(result3[0].user_id, "Has ganado la ronda con tu carta: \n"+res[2]);
																	bot.sendMessage(result2[0].room_id, result4[0].username+" ha ganado la ronda con su carta: \n"+res[2]);
																	nuevaRonda(db, result2[0], result4[0].user_id, result4[0].username, result4[0].points);
																} else bot.sendMessage(msg.chat.id, "Solo el creador puede votar.");
															} else if (result2[0].type=="clasico"){
																if (msg.chat.id == result2[0].dictator_uid){
																	bot.sendMessage(result3[0].user_id, "Has ganado la ronda con tu carta: \n"+res[2]);
																	bot.sendMessage(result2[0].room_id, result4[0].username+" ha ganado la ronda con su carta: \n"+res[2]);
																	nuevaRonda(db, result2[0], result4[0].user_id, result4[0].username, result4[0].points);
																} else bot.sendMessage(msg.chat.id, "Solo el dictador puede votar.");
															} else if (result2[0].type="democracia"){
																db.collection('cardsxgame').updateOne({_id: parseInt(res[1])}, {$set: { "votes": (parseInt(result3[0].votes)+1)}}, function(err, result5) {
																	if (err) {
																		bot.sendMessage(msg.chat.id, "Se ha producido un error al borrar en la tabla.");
																		console.log(err);
																	} else {
																		//Si todo ha ido correctamente
																		if (result5.result.ok == 1) {
																			db.collection('cardsxgame').find({game_id: result[0].game_id}).toArray(function(err, result6){
																				if (err) {
																					bot.sendMessage(msg.chat.id, "Se ha producido un error al borrar en la tabla.");
																					console.log(err);
																				} else {
																					if (getVotes(result6) == result2[0].num_participants){
																						var card = getMax(result6)[0];
																						db.collection('playersxgame').find({user_id: card.user_id}).toArray(function (err, result7) {
																							if (err) {
																								bot.sendMessage(msg.chat.id, "Se ha producido un error al buscar en la tabla.");
																								console.log(err);
																							} else if (result7.length) { 
																								bot.sendMessage(result7[0].user_id, "Has ganado la ronda con tu carta: \n"+card.card);
																								bot.sendMessage(result2[0].room_id, result7[0].username+" ha ganado la ronda con su carta: \n"+card.card);
																								nuevaRonda(db, result2[0], result7[0].user_id, result7[0].username, result7[0].points);
																							} else bot.sendMessage(msg.chat.id, "Error inesperado de usuario.");
																						});
																					}
																				}
																			});
																		} else bot.sendMessage(msg.chat.id, "Error inesperado.");
																	}
																});
															} else bot.sendMessage(msg.chat.id, "Error inesperado.");
														}
													});
												} else bot.sendMessage(msg.chat.id, "Se ha producido un error. No existe la carta especificada.");
											});
										}
									});
								} else bot.sendMessage(msg.chat.id, "Se ha producido un error. No estas jugando ninguna partida.");
							}
						});
					}
				});
			}
		} else if (msg.text.indexOf("/version") == 0){
			bot.sendMessage(msg.chat.id, "Versión 0.2. Creado por @themarioga");
		} else {
			//En caso de que este enviando una carta blanca
			if (/^\/([0-9])\s(.*)/i.test(msg.text)) {
				res = msg.text.match(/^\/([0-9])\s(.*)/i);
				var opts = {
				  reply_markup: JSON.stringify({
					hide_keyboard: true
				  })
				};
				//Conectamos con la BD
				MongoClient.connect(privatedata.url, function (err, db) {
					if (err) bot.sendMessage(msg.chat.id, "No se ha podido conectar a la base de datos");
					else {
						//Buscamos al jugador en la lista de jugadores
						db.collection('playersxgame').find({user_id: msg.from.id}).toArray(function (err, result) {
							if (err) {
								bot.sendMessage(msg.chat.id, "Se ha producido un error al buscar en la tabla.");
								console.log(err);
							} else {
								//Comprobamos que este jugando alguna partida
								if (result.length){
									//Buscamos la partida
									db.collection('games').find({game_id: result[0].game_id}).toArray(function (err, result2) {
										if (err) {
											bot.sendMessage(msg.chat.id, "Se ha producido un error al buscar en la tabla.");
											console.log(err);
										} else if (result2.length) { //Comprobamos que la partida aun exista
											//Comprobamos que la partida este iniciada
											if (result2[0].currentblack) {
												//Buscamos las cartas que ya se han elegido
												db.collection('cardsxgame').find({game_id: result[0].game_id}).toArray(function (err, result3) {
													if (err) {
														bot.sendMessage(msg.chat.id, "Se ha producido un error al buscar en la tabla.");
														console.log(err);
													} else {
														if ((result2[0].type=="dictadura" && result2[0].creator_id != msg.from.id) || (result2[0].type=="clasico" && result2[0].dictator_uid != msg.from.id) || result2[0].type=="democracia"){
															//Buscamos si el usuario ya ha elegido carta
															var user = searchbyuser(result3, msg.from.id);
															//Comprobamos que aun no haya respondido
															if (!user){
																//Comprobamos que no hayan respondido ya todos los participantes
																if (result3.length < result2[0].num_participants){
																	//Insertamos la carta en al base de datos
																	autoIncrement.getNextSequence(db, 'cardsxgame', '_id', function (err, autoIndex) {
																		db.collection('cardsxgame').insertOne({_id: autoIndex, game_id: result[0].game_id, user_id: msg.from.id, card:res[2], votes: 0}, function (err, result4) {
																			if (err) {
																				bot.sendMessage(msg.chat.id, "Se ha producido un error al insertar en la tabla.");
																				console.log(err);
																			} else {
																				bot.sendMessage(msg.chat.id, "Has elegido: "+res[2], opts);
																				//Eliminamos la carta enviada del array
																				result[0].cards.splice(res[1], 1);
																				//Y la introducimos en la tabla
																				db.collection('playersxgame').updateOne({user_id: msg.from.id}, {$set: { "cards": result[0].cards}}, function(err, result5) {
																					if (err) {
																						bot.sendMessage(msg.chat.id, "Se ha producido un error al borrar en la tabla.");
																						console.log(err);
																					} else {
																						//Si todo ha ido correctamente
																						if (result5.result.ok == 1) {
																							//Si no eres el ultimo en votar
																							if ((result2[0].type=="dictadura" && result3.length+1 < result2[0].num_participants-1) || (result2[0].type=="clasico" && result3.length+1 < result2[0].num_participants-1) || (result2[0].type=="democracia" && result3.length+1 < result2[0].num_participants)) console.log();
																							else if ((result2[0].type=="dictadura" && result3.length+1 == result2[0].num_participants-1) || (result2[0].type=="clasico" && result3.length+1 == result2[0].num_participants-1) || (result2[0].type=="democracia" && result3.length+1 == result2[0].num_participants)) { //Si eres el ultimo en votar
																								//Añadimos la ultima carta al array
																								result3.push({_id: autoIndex, game_id: result[0].game_id, user_id: msg.from.id, card:res[2]});
																								var textgroup = "";
																								var array = [];
																								//Creamos el array con los votos
																								for (i = 0; i<result3.length; i++){
																									textgroup += (i+1)+". "+result3[i].card+"\n";
																									array.push(["/vote_"+result3[i]._id+" "+result3[i].card]);
																								}
																								var opts2 = {
																								  reply_markup: JSON.stringify({
																									keyboard: array,
																									one_time_keyboard: true
																								  })
																								};
																								//Segun el tipo de partida hace una cosa u otra
																								if (result2[0].type == "dictadura"){//Dictadura solo vota el lider
																									textgroup = "Estas son las opciones, el lider votara por privado: \n"+textgroup;
																									bot.sendMessage(result2[0].creator_id, "Debes votar una de estas opciones: ", opts2);
																								} else if (result2[0].type == "clasico") {//Clasico solo vota el lider de esa ronda
																									textgroup = "Estas son las opciones, el lider de esta ronda votara por privado: \n"+textgroup;
																									bot.sendMessage(result2[0].dictator_uid, "Debes votar una de estas opciones: ", opts2);
																								} else if (result2[0].type == "democracia"){//Democracia votan todos
																									textgroup = "Ahora podeis votar por privado entre las siguientes cartas: \n"+textgroup;
																									for (i = 0; i<result3.length; i++){
																										bot.sendMessage(result3[i].user_id, "Debes votar una de estas opciones: ", opts2);
																									}
																								} else bot.sendMessage(msg.chat.id, "Ha ocurrido un error inesperado.");
																								bot.sendMessage(result2[0].room_id, textgroup);
																							} else bot.sendMessage(msg.chat.id, "Ha ocurrido un error inesperado. Referencia: #"+(result3.length+1)+"-"+result2[0].num_participants);
																						} else bot.sendMessage(msg.chat.id, "Ha ocurrido un error inesperado.");
																					}
																				});
																			}
																		});
																	});
																} else bot.sendMessage(msg.chat.id, "Ya ha respondido todo el mundo.");
															} else bot.sendMessage(msg.chat.id, "Ya has respondido en esta ronda.");
														} else bot.sendMessage(msg.chat.id, "El dictador no puede elegir carta.");
													}
												});
											} else bot.sendMessage(msg.chat.id, "La partida aun no se ha iniciado.");
										} else bot.sendMessage(msg.chat.id, "Ya no existe la partida para la que estas votando.");
									});
								} else bot.sendMessage(msg.chat.id, "No estas jugando ninguna partida.");
							}
						});
					}
				});
				//Esas opciones llevaran a su vez keyboard para votar a al carta
			}
		}
	}
});
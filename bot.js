//Cargamos los modulos necesarios y las bases de datos de cartas
var TelegramBot = require('node-telegram-bot-api');
var privatedata = require('./privatedata');
var Cclhbot = require('./game');

//Iniciamos el bot y mongodb
var bot = new TelegramBot(privatedata.token, {polling: true});

//Iniciamos el Bot
var game = new Cclhbot(bot, privatedata.url, function (){
	//////////////////////////////EVENTOS//////////////////////////////
	//Si el comando es /create y sus parametros son:
	//tipo_de_partida-> (dictadura|clasico|democracia)
	//numero_de_players-> ([2-9])
	//numero_de_rondas-> ([1-5])
	bot.onText(/^\/create(?:@cclhbot)?\s(dictadura|clasico|democracia)\s([2-9])\s([1-9])(?:\s(.*))?/, function (msg, match) {
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type != "private") {
			//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
			game.db.count('games', {room_id: msg.chat.id}, msg.chat.id, function(count_games) {
				//Si no hay ninguna partida en este grupo
				if (!count_games) {
					//Comprobamos que el usuario no este en ninguna otra partida
					game.db.count('players', {user_id: msg.from.id}, msg.chat.id, function(count_players){
						//Si no esta en ninguna partida
						if (!count_players){
							//Obtenemos una ID unica para la partida
							game.getUniqueKey(msg, 10000,99000, function(game_id) {
								//Obtenemos el nombre de usuario del creador
								var name = game.getUsername(msg);
								//Creamos la partida
								dictionary = "";
								if (typeof match[4] == "string" && match[4] != "") {
									dictionary = match[4];
								} else {
									dictionary = "clasico";
								}
								game.db.count('dictionaries', {name: dictionary, valid:1}, msg.chat.id, function(count_cards) {
									if (count_cards) {
										bot.sendMessage(msg.chat.id, "Se ha seleccionado el diccionario "+dictionary);
										game.createGame({game_id: game_id, room_id: msg.chat.id, creator_id: msg.from.id, creator_name: name, dictator_id: 1, type: match[1], n_players: match[2], n_cardstowin: match[3], currentblack: 0, dictionary: dictionary}, msg.chat.id, function (){
											//Añadimos al creador
											game.db.insert('players', {player_id: 1, game_id: game_id, user_id: msg.from.id, username: name, points: 0, vote_delete: 0}, msg.chat.id, function(){
												//Y se le notifica por privado
												bot.sendMessage(msg.from.id, "Te has unido a la partida.");
												setTimeout(function(){bot.sendMessage(msg.chat.id, name+" se ha unido a la partida");}, 550);
											});
											//Y finalmente se envia la informacion al grupo.
											bot.sendMessage(msg.chat.id, "Se ha creado la sala, ahora escribeme por privado (a @cclhbot) lo siguiente:");
											setTimeout(function(){bot.sendMessage(msg.chat.id, "/join "+game_id)}, 500);
										});
									} else {
										bot.sendMessage(msg.chat.id, "Lo siento, ese diccionario no existe o esta incompleto, utilizando el diccionario 'clasico' en su lugar...");
										dictionary = "clasico";
										game.createGame({game_id: game_id, room_id: msg.chat.id, creator_id: msg.from.id, creator_name: name, dictator_id: 1, type: match[1], n_players: match[2], n_cardstowin: match[3], currentblack: 0, dictionary: dictionary}, msg.chat.id, function (){
											//Añadimos al creador
											game.db.insert('players', {player_id: 1, game_id: game_id, user_id: msg.from.id, username: name, points: 0, vote_delete: 0}, msg.chat.id, function(){
												//Y se le notifica por privado
												bot.sendMessage(msg.from.id, "Te has unido a la partida.");
												setTimeout(function(){bot.sendMessage(msg.chat.id, name+" se ha unido a la partida");}, 550);
											});
											//Y finalmente se envia la informacion al grupo.
											bot.sendMessage(msg.chat.id, "Se ha creado la sala, ahora escribeme por privado (a @cclhbot) lo siguiente:");
											setTimeout(function(){bot.sendMessage(msg.chat.id, "/join "+game_id)}, 500);
										});
									}
								});
							});
						} else bot.sendMessage(msg.chat.id, "Ya estas participando en otra partida.");
					});
				} else bot.sendMessage(msg.chat.id, "Este grupo ya tiene una partida activa, su creador puede borrarla con /delete");
			});
			//En el caso de que no haya ya partida iniciada...
		} else bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
	});
	//Si el comando es /delete
	bot.onText(/^\/delete(?:@cclhbot)?/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type != "private") {
			//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
			game.db.find('games', {room_id: msg.chat.id}, msg.chat.id, function(r_game) {
				if (r_game.length) {
					//En el caso de que tenga una partida comprueba que el usuario que la borra es el mismo que la creo.
					if (r_game[0].creator_id == msg.from.id){
						game.deleteGameData(r_game[0].game_id, msg.chat.id, function (){
							bot.sendMessage(msg.chat.id, "Se ha borrado la partida.");
						});
					} else bot.sendMessage(msg.chat.id, "Solo el creador "+r_game[0].creator_name+" puede borrar la partida.");
				} else bot.sendMessage(msg.chat.id, "Este grupo no tiene partidas activas.");
			});
		} else bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
	});
	//Si el comando es /startgame
	bot.onText(/^\/startgame(?:@cclhbot)?/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type != "private") {
			//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
			game.db.find('games', {room_id: msg.chat.id}, msg.chat.id, function(r_game) {
				if (r_game.length) {
					//En el caso de que tenga una partida comprueba que el usuario que la borra es el mismo que la creo.
					if (r_game[0].creator_id == msg.from.id){
						if (parseInt(r_game[0].currentblack) == 0){
							//Comprobamos
							game.db.find('players', {game_id: r_game[0].game_id}, msg.chat.id, function(r_players){
								//Comprobamos que la partida este llena
								if (r_players.length == r_game[0].n_players){
									game.nextRound(r_game[0], r_players, msg.chat.id);
								} else bot.sendMessage(msg.chat.id, "Aun no se ha llenado la partida. "+r_players.length+" de "+r_game[0].n_players+" participantes");
							});
						} else bot.sendMessage(msg.chat.id, "La partida ya esta iniciada.");
					} else bot.sendMessage(msg.chat.id, "Solo el creador "+r_game[0].creator_name+" puede iniciar la partida.");
				} else bot.sendMessage(msg.chat.id, "Este grupo no tiene partidas activas.");
			});
		} else bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
	});
	//Si el comando es /votedelete
	bot.onText(/^\/votedelete(?:@cclhbot)?/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type != "private") {
			//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
			game.db.find('games', {room_id: msg.chat.id}, msg.chat.id, function(r_game) {
				if (r_game.length) {
					game.db.find('players', {user_id: msg.from.id, game_id: r_game[0].game_id}, msg.chat.id, function(r_players){
						if (r_players.length){
							if (parseInt(r_players[0].vote_delete) == 0){
								if ((parseInt(r_game[0].vote_delete)+1) < (r_game[0].n_players/2)){ //ToDo?: usar los jugadores que hay en lugar del total
									game.db.update('games', {game_id: r_game[0].game_id}, {"vote_delete": (parseInt(r_game[0].vote_delete)+1)}, msg.chat.id, function (){
										game.db.update('players', {user_id: msg.from.id}, {"vote_delete": 1}, msg.chat.id, function (){
											bot.sendMessage(msg.chat.id, "Has votado para eliminar la partida. Deben votar al menos la mitad de los participantes.");
										});
									});
								} else {
									//Borrar la partida
									game.deleteGameData(r_game[0].game_id, msg.chat.id, function (){
										bot.sendMessage(msg.chat.id, "Se ha borrado la partida.");
									});
								}
							} else bot.sendMessage(msg.chat.id, "Ya has votado para eliminar la partida.");
						} else bot.sendMessage(msg.chat.id, "No eres miembro de esta partida.");
					});
				} else bot.sendMessage(msg.chat.id, "Este grupo no tiene partidas activas.");
			});
		} else bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
	});
	//Si el comando es /checkvotes
	bot.onText(/^\/checkvotes(?:@cclhbot)?/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type != "private") {
			//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
			game.db.find('games', {room_id: msg.chat.id}, msg.chat.id, function(r_game) {
				if (r_game.length) {
					if (parseInt(r_game[0].currentblack)){
						game.db.count('cardsxround', {game_id: r_game[0].game_id}, msg.chat.id, function (count_cards){
							if (count_cards == r_game[0].n_players){
								game.db.sumax('cardsxround', 'votes', {game_id: r_game[0].game_id}, msg.chat.id, function(sum) {
									//ToDo?: ver quien falta por votar
									bot.sendMessage(msg.chat.id, "Han votado "+sum[0].sum+" jugadores de "+r_game[0].n_players);
								});
							} else bot.sendMessage(msg.chat.id, "Aun no han elegido carta todos los jugadores.");
						});
					} else bot.sendMessage(msg.chat.id, "La partida aun no esta iniciada.");
				} else bot.sendMessage(msg.chat.id, "Este grupo no tiene partidas activas.");
			});
		} else bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
	});
	//Si el comando es /checkplayers
	bot.onText(/^\/checkplayers(?:@cclhbot)?/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por un grupo
		if (msg.chat.type != "private") {
			//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
			game.db.find('games', {room_id: msg.chat.id}, msg.chat.id, function(r_game) {
				if (r_game.length) {
					if (parseInt(r_game[0].currentblack)){
						game.db.find('players', {game_id: r_game[0].game_id}, msg.chat.id, function(r_players){
							game.db.find('cardsxround', {game_id: r_game[0].game_id}, msg.chat.id, function (r_cards){
								if (r_players.length != r_cards.length){
									var texto = "";
									for (i=0; i<r_players.length;i++){
										existe = false;
										for (j=0; j<r_cards.length;j++){
											if (r_players[i].user_id == r_cards[j].user_id) existe = true;
										}
										if (!existe) texto += r_players[i].username+"\n";
									}
									bot.sendMessage(msg.chat.id, "Aun no han elegido carta: \n"+texto);
								} else bot.sendMessage(msg.chat.id, "Todo el mundo ha elegido carta.");
							});
						});
					} else bot.sendMessage(msg.chat.id, "La partida aun no esta iniciada.");
				} else bot.sendMessage(msg.chat.id, "Este grupo no tiene partidas activas.");
			});
		} else bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
	});
	//Si el comando es /join
	bot.onText(/^\/join(?:@cclhbot)?\s(.*)/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por privado
		if (msg.chat.type == "private") {
			//Buscamos en la tabla games si el grupo desde el que se invoca tiene ya una partida.
			game.db.find('games', {game_id: match[1]}, msg.chat.id, function(r_game) {
				if (r_game.length) {
					if (!parseInt(r_game[0].currentblack)){
						game.db.count('players', {game_id: r_game[0].game_id}, msg.chat.id, function(count_players){
							if (count_players < r_game[0].n_players){
								game.db.count('players', {user_id: msg.from.id}, msg.chat.id, function(player){
									if (!player){
										//Obtenemos el nombre de usuario del creador
										var name = game.getUsername(msg);
										game.db.insert('players', {player_id: count_players+1, game_id: r_game[0].game_id, user_id: msg.from.id, username: name, points: 0, vote_delete: 0}, msg.chat.id, function(){
											//Y se le notifica por privado
											bot.sendMessage(msg.from.id, "Te has unido a la partida.");
											setTimeout(function(){bot.sendMessage(r_game[0].room_id, name+" se ha unido a la partida");}, 550);
										});
									} else bot.sendMessage(msg.chat.id, "Ya estas jugando una partida.");
								});
							} else bot.sendMessage(msg.chat.id, "La partida esta llena, no puedes unirte.");
						});
					} else bot.sendMessage(msg.chat.id, "La partida ya esta iniciada.");
				} else bot.sendMessage(msg.chat.id, "El grupo indicado no existe.");
			});
		} else bot.sendMessage(msg.chat.id, "Por favor enviame este comando por privado.");
	});
	//Si el comando es /join
	bot.onText(/^\/vote\_([0-9]+)\s(.*)/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por privado
		if (msg.chat.type == "private") {
			game.db.find('players', {user_id: msg.from.id}, msg.chat.id, function(r_player){
				if (r_player.length){
					game.db.find('games', {game_id: r_player[0].game_id}, msg.chat.id, function(r_game) {
						if (r_game.length) {
							if (r_game[0].currentblack){
								game.db.count('cardsxround', {game_id: r_game[0].game_id}, msg.chat.id, function(n_cards){
									if (n_cards >= r_game[0].n_players-1){
										game.db.find('cardsxround', {card_id: parseInt(match[1]), game_id: r_game[0].game_id}, msg.chat.id, function (r_cards){
											if (r_cards.length){
												game.db.find('players', {game_id: r_game[0].game_id}, msg.chat.id, function(r_players){
													if (r_players.length){
														game.db.find('players', {user_id: r_cards[0].user_id}, msg.chat.id, function(player){
															if (player.length){
																var opts = {
																  reply_markup: JSON.stringify({
																	hide_keyboard: true
																  })
																};
																bot.sendMessage(msg.chat.id, "Has votado: "+match[2], opts);
																if (r_game[0].type=="dictadura"){
																	if (r_game[0].creator_id == msg.from.id){
																		bot.sendMessage(player[0].user_id, "Has ganado la ronda con tu carta: \n"+r_cards[0].card_text+"\nTienes "+(player[0].points+1)+" puntos.");
																		bot.sendMessage(r_game[0].room_id, player[0].username+" ha ganado la ronda con su carta: \n"+r_cards[0].card_text+"\nTiene "+(player[0].points+1)+" puntos.");
																		game.roundWinner(player[0], r_game, r_players, r_game[0].room_id);
																	} else bot.sendMessage(msg.chat.id, "Solo el dictador puede votar.");
																} else if (r_game[0].type=="clasico"){
																	game.db.find('players', {player_id: r_game[0].dictator_id, game_id: r_game[0].game_id}, msg.chat.id, function(dictator){
																		if (dictator[0].user_id == msg.from.id){
																			bot.sendMessage(player[0].user_id, "Has ganado la ronda con tu carta: \n"+r_cards[0].card_text+"\n Tienes "+(player[0].points+1)+" puntos.");
																			bot.sendMessage(r_game[0].room_id, player[0].username+" ha ganado la ronda con su carta: \n"+r_cards[0].card_text+"\n Tiene "+(player[0].points+1)+" puntos.");
																			game.roundWinner(player[0], r_game, r_players, r_game[0].room_id);
																		} else bot.sendMessage(msg.chat.id, "Solo el lider de la ronda puede votar.");
																	});
																} else if (r_game[0].type="democracia"){
																	game.db.update('cardsxround', {card_id: parseInt(match[1]), game_id: r_game[0].game_id}, { "votes": (parseInt(r_cards[0].votes)+1)}, msg.chat.id, function (){
																		game.db.sumax('cardsxround', 'votes', {game_id: r_game[0].game_id}, msg.chat.id, function(cxr){
																			if (cxr[0].sum == r_game[0].n_players){
																				game.db.sortFind('cardsxround', {game_id: r_game[0].game_id}, {"votes": -1}, 1, msg.chat.id, function (card){
																					game.db.find('players', {user_id: card[0].user_id}, msg.chat.id, function(player){
																						bot.sendMessage(player[0].user_id, "Has ganado la ronda con tu carta: \n"+card[0].card_text+"\n Tienes "+(player[0].points+1)+" puntos.");
																						bot.sendMessage(r_game[0].room_id, player[0].username+" ha ganado la ronda con su carta: \n"+card[0].card_text+"\n Tiene "+(player[0].points+1)+" puntos.");
																						game.roundWinner(player[0], r_game, r_players, r_game[0].room_id);
																					});
																				});
																			}
																		});
																	});
																} else bot.sendMessage(msg.chat.id, "Error inesperado (Tipo no existente).");
															} else bot.sendMessage(msg.chat.id, "Error inesperado (No hay jugadores).");
														});
													} else bot.sendMessage(msg.chat.id, "Error inesperado.");
												});
											} else bot.sendMessage(msg.chat.id, "La carta votada no existe.");
										});
									} else bot.sendMessage(msg.chat.id, "Aun no han enviado carta todos los jugadores.");
								});
							} else bot.sendMessage(msg.chat.id, "La partida aun no se ha iniciado.");
						} else bot.sendMessage(msg.chat.id, "El grupo indicado no existe.");
					});
				} else bot.sendMessage(msg.chat.id, "Se ha producido un error. No estas jugando ninguna partida.");
			});
		} else bot.sendMessage(msg.chat.id, "Por favor enviame este comando por privado.");
	});
	//Si es una carta
	bot.onText(/^\/([0-9]+)\s(.*)/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por privado
		if (msg.chat.type == "private") {
			game.db.find('players', {user_id: msg.from.id}, msg.chat.id, function(r_player){
				if (r_player.length){
					game.db.find('games', {game_id: r_player[0].game_id}, msg.chat.id, function(r_game) {
						if (r_game.length) {
							if (r_game[0].currentblack){
								game.db.find('cardsxround', {game_id: r_game[0].game_id}, msg.chat.id, function(n_cards){
									if (n_cards.length < r_game[0].n_players){
										game.db.count('cardsxround', {user_id: msg.from.id}, msg.chat.id, function(n_player){
											if (!n_player){
												if ((r_game[0].type=="dictadura" && r_game[0].creator_id != msg.from.id) || (r_game[0].type=="clasico" && r_game[0].dictator_uid != msg.from.id) || r_game[0].type=="democracia"){
													game.db.insert('cardsxround', {card_id: n_cards.length+1, game_id: r_game[0].game_id, user_id: msg.from.id, card_text:match[2], votes: 0}, msg.chat.id, function(){
														var opts = {
															reply_markup: JSON.stringify({
																hide_keyboard: true
															})
														};
														bot.sendMessage(msg.chat.id, "Has elegido: "+match[2], opts);
														game.db.remove('wcardsxgame', {cxpxg_id: parseInt(match[1]), game_id: r_game[0].game_id, player_id: r_player[0].player_id}, msg.chat.id, function (){
															//Si no eres el ultimo en votar
															if ((r_game[0].type=="dictadura" && n_cards.length+1 < r_game[0].n_players-1) || 
															(r_game[0].type=="clasico" && n_cards.length+1 < r_game[0].n_players-1) || 
															(r_game[0].type=="democracia" && n_cards.length+1 < r_game[0].n_players)){}
															else if ((r_game[0].type=="dictadura" && n_cards.length+1 == r_game[0].n_players-1) || 
																(r_game[0].type=="clasico" && n_cards.length+1 == r_game[0].n_players-1) || 
																(r_game[0].type=="democracia" && n_cards.length+1 == r_game[0].n_players)) { //Si eres el ultimo en votar
																//Añadimos la ultima carta al array
																n_cards.push({card_id: n_cards.length+1, game_id: r_game[0].game_id, user_id: msg.from.id, card_text:match[2], votes: 0});
																var textgroup = "";
																var array = [];
																//Creamos el array con los votos
																for (i = 0; i<n_cards.length; i++){
																	textgroup += (i+1)+". "+n_cards[i].card_text+"\n";
																	array.push(["/vote_"+n_cards[i].card_id+" "+n_cards[i].card_text]);
																}
																var opts2 = {
																  reply_markup: JSON.stringify({
																	keyboard: array,
																	one_time_keyboard: true
																  })
																};
																game.db.limitFind('bcardsxgame', {cxg_id: (parseInt(r_game[0].currentblack)), game_id: r_game[0].game_id}, 1, msg.chat.id, function (bcard){
																	if (bcard.length){
																		setTimeout(function (){
																			//Segun el tipo de partida hace una cosa u otra
																			if (r_game[0].type == "dictadura"){//Dictadura solo vota el lider
																				textgroup = bcard[0].card_text+"\nEstas son las opciones, el lider votara por privado: \n"+textgroup;
																				bot.sendMessage(r_game[0].creator_id, bcard[0].card_text+"\nDebes votar una de estas opciones: ", opts2);
																			} else if (r_game[0].type == "clasico") {//Clasico solo vota el lider de esa ronda
																				game.db.find('players', {player_id: r_game[0].dictator_id, game_id: r_game[0].game_id}, msg.chat.id, function(dictator){
																					textgroup = bcard[0].card_text+"\nEstas son las opciones, el lider de esta ronda votara por privado: \n"+textgroup;
																					bot.sendMessage(dictator[0].user_id, bcard[0].card_text+"\nDebes votar una de estas opciones: ", opts2);
																				});
																			} else if (r_game[0].type == "democracia"){//Democracia votan todos
																				textgroup = bcard[0].card_text+"\nAhora podeis votar por privado entre las siguientes cartas: \n"+textgroup;
																				for (i = 0; i<n_cards.length; i++){
																					bot.sendMessage(n_cards[i].user_id, bcard[0].card_text+"\nDebes votar una de estas opciones: ", opts2);
																				}
																			} else bot.sendMessage(msg.chat.id, "Ha ocurrido un error inesperado.");
																			bot.sendMessage(r_game[0].room_id, textgroup);
																		}, 300);
																	} else bot.sendMessage(msg.chat.id, "error inesperado.");
																});
															} else bot.sendMessage(msg.chat.id, "Ha ocurrido un error inesperado. Referencia: #"+(n_cards.length+1)+"-"+r_game[0].n_players);
														});
													});
												} else bot.sendMessage(msg.chat.id, "El dictador no puede elegir carta.");
											} else bot.sendMessage(msg.chat.id, "Ya has votado en esta ronda");
										});
									} else bot.sendMessage(msg.chat.id, "Ya ha respondido todo el mundo.");
								});
							} else bot.sendMessage(msg.chat.id, "La partida aun no se ha iniciado.");
						} else bot.sendMessage(msg.chat.id, "El grupo indicado no existe.");
					});
				} else bot.sendMessage(msg.chat.id, "Se ha producido un error. No estas jugando ninguna partida.");
			});
		} else bot.sendMessage(msg.chat.id, "Por favor enviame este comando por privado.");
	});
	//ToDo: enviar leave por priv como join?
	bot.onText(/^\/leave(?:@cclhbot)?/i, function (msg, match) {
		if (msg.chat.type != "private") {
			game.db.find('games', {room_id: msg.chat.id}, msg.chat.id, function(r_game) {
				if (r_game.length) {
					game.db.find('players', {user_id: msg.from.id, game_id: r_game[0].game_id}, msg.chat.id, function(r_player){
						if (r_player.length){
							if (r_game[0].creator_id != msg.from.id){
								if ((r_game[0].type == "clasico" && r_player[0].player_id != r_game[0].dictator_id) || r_game[0].type != "clasico"){
									game.db.count('cardsxround', {user_id: msg.from.id, game_id: r_game[0].game_id}, msg.chat.id, function(r_players){
										if (!r_players){
											if (r_game[0].currentblack != 0){ //Partida iniciada
												if (r_game[0].n_players-1 < 2){
													bot.sendMessage(msg.chat.id, r_player[0].username+" ha abandonado la partida.");
													//Borrar la partida
													game.deleteGameData(r_game[0].game_id, msg.chat.id, function (){
														bot.sendMessage(msg.chat.id, "Se ha borrado la partida.");
													});
												} else {
													game.db.find('cardsxround', {game_id: r_game[0].game_id}, msg.chat.id, function(n_cards){
														if (n_cards == r_game[0].n_players-1){
															game.db.update('games', {game_id: r_game[0].game_id}, { "n_players": (parseInt(r_game[0].n_players)-1)}, msg.chat.id, function (){
																game.db.remove('players', {user_id: msg.from.id}, msg.chat.id, function (){
																	bot.sendMessage(msg.chat.id, r_player[0].username+" ha abandonado la partida.");
																});
															});
														} else bot.sendMessage(msg.chat.id, "Lo sentimos, no puedes abandonar si solo quedas tu por elegir carta. Intentalo mas tarde.");
													});
												}
											} else { //Partida sin iniciar
												game.db.remove('players', {user_id: msg.from.id}, msg.chat.id, function (){
													bot.sendMessage(msg.chat.id, r_player[0].username+" ha abandonado la partida.");
												});
											}
										} else bot.sendMessage(msg.chat.id, "Lo sentimos, no puedes abandonar si ya has enviado carta este turno.");
									});
								} else bot.sendMessage(msg.chat.id, "Lo sentimos, el dictador no puede dejar la partida.");
							} else bot.sendMessage(msg.chat.id, "Lo sentimos, el creador no puede dejar la partida.");
						} else bot.sendMessage(msg.chat.id, "No estas jugando esta partida.");
					});
				} else bot.sendMessage(msg.chat.id, "El grupo indicado no existe.");
			});
		} else bot.sendMessage(msg.chat.id, "Por favor enviame este comando por un grupo.");
	});
	//Si el comando es /newdictionary
	bot.onText(/^\/newdictionary(?:@cclhbot)?\s(.*)/i, function (msg, match) { 
		//Detectamos si el mensaje recibido es por privado
		if (msg.chat.type == "private") {
			//Buscamos en la tabla diccionarios si creador ya tiene una
			game.db.count('dictionaries', {creator_id: msg.from.id}, msg.chat.id, function(r_dic) {
				if (!r_dic) {
					//Buscamos en la tabla diccionarios si el nombre ya existe.
					game.db.count('dictionaries', {name: match[1]}, msg.chat.id, function(n_dic) {
						if (!n_dic) {
							//Obtenemos el nombre de usuario del creador
							var name = game.getUsername(msg);
							//Añadimos el diccionario a la BD
							game.db.insert('dictionaries', {creator_id: msg.from.id, creator_name: name, name: match[1], valid: 0}, msg.chat.id, function(){
								//Y se le notifica por privado
								bot.sendMessage(msg.from.id, "Se ha creado el diccionario, ahora procede a añadir cartas con /addblackcard y /addwhitecard.");
							});
						} else bot.sendMessage(msg.chat.id, "Lo sentimos, ya existe un diccionario con ese nombre.");
					});
				} else bot.sendMessage(msg.chat.id, "Lo sentimos, por el momento un usuario solo puede crear un diccionario.");
			});
		} else bot.sendMessage(msg.chat.id, "Por favor envia este comando por privado.");
	});
	//Si el comando es /addblackcard
	bot.onText(/^\/addblackcard(?:@cclhbot)?\s(.*)/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por privado
		if (msg.chat.type == "private") {
			//Buscamos en la tabla diccionarios si el nombre ya existe.
			game.db.find('dictionaries', {creator_id: msg.from.id}, msg.chat.id, function(r_dic) {
				if (r_dic.length) {
					//Buscamos en la tabla diccionarios si el nombre ya existe.
					game.db.count('blackcards', {dictionary: r_dic[0].name}, msg.chat.id, function(n_dic) {
						//Si hay menos de 50 cartas
						if (n_dic < 50) {
							game.db.insert('blackcards', {card_text: match[1], dictionary: r_dic[0].name}, msg.chat.id, function(){
								//se le notifica por privado
								if ((n_dic + 1) < 50) bot.sendMessage(msg.from.id, "Se ha añadido la carta. Llevas "+(n_dic+1)+" de 50.");
								else {
									game.db.count('whitecards', {dictionary: r_dic[0].name}, msg.chat.id, function(wca) {
										if (wca == 405){
											game.db.update('dictionaries', {creator_id: msg.from.id}, { "valid": 1}, msg.chat.id, function (){
												bot.sendMessage(msg.from.id, "Diccionario completado, ya puedes jugar con el!");
											});
										} else bot.sendMessage(msg.chat.id, "Se ha completado el diccionario de cartas negras. Ahora completa el diccionario de blancas.");
									});
								}
							});
						} else bot.sendMessage(msg.chat.id, "Este diccionario ya esta completo.");
					});
				} else bot.sendMessage(msg.chat.id, "Debes crear primero un diccionario.");
			});
		} else bot.sendMessage(msg.chat.id, "Por favor envia este comando por privado.");
	});
	//Si el comando es /addwhitecard
	bot.onText(/^\/addwhitecard(?:@cclhbot)?\s(.*)/i, function (msg, match) {
		//Detectamos si el mensaje recibido es por privado
		if (msg.chat.type == "private") {
			//Buscamos en la tabla diccionarios si el nombre ya existe.
			game.db.find('dictionaries', {creator_id: msg.from.id}, msg.chat.id, function(r_dic) {
				if (r_dic.length) {
					//Buscamos en la tabla diccionarios si el nombre ya existe.
					game.db.count('whitecards', {dictionary: r_dic[0].name}, msg.chat.id, function(n_dic) {
						//Si hay menos de 405 cartas
						if (n_dic < 405) {
							game.db.insert('whitecards', {card_text: match[1], dictionary: r_dic[0].name}, msg.chat.id, function(){
								//se le notifica por privado
								if ((n_dic + 1) < 405) bot.sendMessage(msg.from.id, "Se ha añadido la carta. Llevas "+(n_dic+1)+" de 405.");
								else {
									game.db.count('blackcards', {dictionary: r_dic[0].name}, msg.chat.id, function(bca) {
										if (bca == 50){
											game.db.update('dictionaries', {creator_id: msg.from.id}, { "valid": 1}, msg.chat.id, function (){
												bot.sendMessage(msg.from.id, "Diccionario completado, ya puedes jugar con el!");
											});
										} else bot.sendMessage(msg.chat.id, "Se ha completado el diccionario de cartas blancas. Ahora completa el diccionario de negras.");
									});
								}
							});
						} else bot.sendMessage(msg.chat.id, "Este diccionario ya esta completo.");
					});
				} else bot.sendMessage(msg.chat.id, "Debes crear primero un diccionario.");
			});
		} else bot.sendMessage(msg.chat.id, "Por favor envia este comando por privado.");
	});
	//Si el comando es /listdicionaries
	bot.onText(/^\/listdictionaries(?:@cclhbot)?/i, function (msg, match) {
		if (msg.chat.type != "private") {
			//Buscamos en la tabla diccionarios
			game.db.find('dictionaries', {valid:1}, msg.chat.id, function(r_dic) {
				if (r_dic.length) {
					var texto = "";
					for (i=0; i< r_dic.length; i++){
						texto += r_dic[i].name+" de "+r_dic[i].creator_name+"\n";
					}
					bot.sendMessage(msg.chat.id, "Puedes usar cualquiera de estos diccionarios: \n"+texto);
				} else bot.sendMessage(msg.chat.id, "No hay ningun diccionario.");
			});
		} else bot.sendMessage(msg.chat.id, "Por favor envia este comando por un grupo.");
	});
	bot.onText(/^\/sendmessage(?:@cclhbot)?\s(.*)/i, function (msg, match) {
		if (msg.chat.type == "private") {
			if (msg.chat.id == 5890303) {
				game.db.find('players', {}, msg.chat.id, function(r_pla) {
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
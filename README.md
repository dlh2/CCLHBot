# CCLHBot
Bot de telegram de Cartas contra la humanidad

# ToDo

General
- Revisar y reparar el comando leave (intentar que se pueda abandonar en cualquier momento) (si quedan menos de 3 jugadores se borra la partida)
- Reducir/optimizar peticiones a bd
- Añadir la opcion de que los jugadores puedan borrar su cuenta

Bot.js
- Posibilidad de crear diccionarios de mas de 405/50 cartas
- Posibilidad de elegir entre mas de 5 diccionarios (con paginacion) al crear una partida
- Posibilidad de añadir "bots" a la partida
	
Game.js
- Revisar los metodos en los que entra por parametro r_game por si hay que limitar la informacion que recibe a solo la que va a usar
				
Db.js
- Crear peticiones One and All para todo (por ejemplo findOne y findAll)
- Al consultar la BD usar el callback de 2 parametros (err, response) para propagar errores y usar el metodo del return; para capturarlos

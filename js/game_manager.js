"use strict";

function GameManager(size, InputManager, Actuator, StorageManager, seed, level, customLevelString, editor)
{
	this.medalCount = 0;
	this.initialSeed = seed;
	this.seed = seed;
    this.seedChainCount = 0;
	this.addTilesOnMove = false;
	this.winWhenSingleTile = !this.addTilesOnMove;
	this.numWalls = 4;
	this.size           = size; // Size of the grid
	this.inputManager   = new InputManager;
	this.storageManager = new StorageManager;
	this.actuator       = new Actuator;
	this.level 			= level;
	this.levelIdentifier = "X";
	this.customLevelString = customLevelString;
	this.isEditor = editor != null && editor != undefined && editor != false;
	this.loading = false;

	this.startingBudget = 65536;
	this.startTiles = 8;
	this.movesTaken = 0;
	this.highestTileMade = 0;
	this.highestTileMadeAtMove = 0;

	this.presolveManager = new PresolveManager(this.size, this.storageManager, this);

	this.inputManager.on("move", this.move.bind(this));
	this.inputManager.on("restart", this.restart.bind(this));
	this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));
	this.inputManager.on("goToMenu", this.goToMenu.bind(this));
	
	this.isInfinity = false;
	
	this.levels = [		// Easy
						{lvl: "0X65060566076XXX", perfect:5, gold:5, silver:15, bronze:20, price:0},			// 1
						{lvl: "500X766X57005XX5", perfect:8, gold:8, silver:15, bronze:20, price:1},			// 2
						{lvl: "4200XX05237X608X", perfect:11, gold:11, silver:25, bronze:30, price:2},			// 3
						{lvl: "4524236470630347", perfect:17, gold:17, silver:20, bronze:40, price:3},			// 4
						{lvl: "08570314X160011X", perfect:14, gold:14, silver:30, bronze:40, price:4},			// 5
						{lvl: "XXX5X08X650006X6", perfect:11, gold:11, silver:15, bronze:20, price:5},			// 6

						// Medium
						{lvl: "XX6084X407X0X50X", perfect:10, gold:10, silver:15, bronze:20, price:6},			// 7
						{lvl: "6X4X006056505476", perfect:16, gold:16, silver:30, bronze:40, price:7},			// 8
						{lvl: "1511021367637260", perfect:17, gold:17+1, silver:30, bronze:40, price:8},		// 9
						{lvl: "6534660605125166", perfect:13, gold:13+1, silver:23, bronze:40, price:9},		// 10
						{lvl: "0110515440170384", perfect:18, gold:18+1, silver:30, bronze:40, price:10},		// 11

						// Hard
						//{lvl: "1371466150057414", perfect:23, gold:23+1, silver:60, bronze:70, price:11},		// 12
						{lvl: "5004630466043576", perfect:21, gold:21+1, silver:50, bronze:90, price:12},		// 12 13
						{lvl: "00083X7XX50435X5", perfect:13, gold:13+1, silver:50, bronze:99, price:13},		// 13 14
						{lvl: "1143053101533837", perfect:16, gold:16+1, silver:40, bronze:50, price:14},		// 14 15

						// very hard
						{lvl: "2X733600482300X4", perfect:22, gold:22+1, silver:90, bronze:99, price:30},	// 15  16

						// debug
						// {lvl: "XX11XXXXXXXXXXXX", gold:1, silver:3, bronze:5, price:30}		// X
				];

	this.setupInitBy = "Frontend";
	this.setup();
}

// Restart the game
GameManager.prototype.restart = function ()
{
	this.seed = this.initialSeed;
    this.seedChainCount = 0;
	//this.storageManager.clearGameState();
	this.actuator.continueGame(); // Clear the game won/lost message
	this.setupInitBy = "Restart";
	this.setup();
};

// move to next level
GameManager.prototype.keepPlaying = function (force)
{
	// ugly WTF javascrip uggghhhhh
	if(!force && !window.gm.currentLevelHasBeenBeaten())
		return;
	this.level = this.level + 1;
	this.initialSeed++;
	this.seed = this.initialSeed;
	//this.storageManager.clearGameState();
	this.actuator.continueGame(); // Clear the game won/lost message
	this.setupInitBy = "Continue";
	this.setup();
};

GameManager.prototype.goToMenu = function ()
{
	window.showMainMenu();
};

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function () 
{
	if (this.over || this.won) 
		return true;
	else 
		return false;
};

GameManager.prototype.seededRandom = function ()
{
	var max = 1;
	var min = 0;

	this.seed = (this.seed * 9301 + 49297) % 233280;
	var rnd = this.seed / 233280;

	return min + rnd * (max - min);
};

// Set up the game
GameManager.prototype.setup = function ()
{
	// afte rthe last level go into endless mode
	if(this.level >= this.levels.length)
	{
		this.seed = this.initialSeed = parseInt(this.storageManager.getHighestRandomCompleted())+1;
		this.isInfinity = true;
		this.level = NaN;
	}

    this.seedChainCount = 0;
	var previousState = null; //this.storageManager.getGameState();

	// shut down any solver that might be running
	if(this.solver)
		this.solver.cancel();

	this.isMenu = false;
	
	// figureout how many medals the user has
	this.medalCount = 0;
	for(var i = 0; i < this.levels.length; ++i)
		this.medalCount += this.medalLevel(i);

	// Reload the game from a previous game if present
	if (previousState)
	{
		this.grid = new Grid(previousState.grid.size,
                                previousState.grid.cells); // Reload grid
		this.score = previousState.score;
		this.over = previousState.over;
		this.won = previousState.won;
		this.movesTaken = previousState.movesTaken;
		this.highestTileMade = previousState.highestTileMade;
		this.highestTileMadeAtMove = previousState.highestTileMadeAtMove;
	} else
	{
		this.grid = new Grid(this.size);
		this.score = 0;
		this.over = false;
		this.won = false;
		this.movesTaken = 0;
		this.highestTileMade = 0;
		this.highestTileMadeAtMove = 0;

		// Add the initial tiles
		this.addStartTiles();
	}

	// Update the actuator
	this.levelIdentifier = this.getGridAsSimpleString();
	this.actuator.setBoardString(this.levelIdentifier);
	var level = (this.level != null && this.level != undefined) ? this.levels[this.level] : null;
	if(level)
	{
		this.actuator.setMedalNumbers(level.gold, level.silver, level.bronze, true);
		this.actuator.setContextString("Level " + (this.level + 1));
	}
	else
	{
		//this.actuator.setMedalNumbers("--", "--", "--");
		if(this.isEditor)
			this.actuator.setContextString("EDITOR: Use Left/Right Click");
		else if(this.customLevelString)
		{
			if(this.customLevelString == "XXXXXXXXXXXXXXXX") // Menu
			{
				this.isMenu = true;
				this.actuator.setContextString("<strong class=\"important\">TOUCH A SQUARE TO PLAY LEVEL</strong>");
			}
			else
				this.actuator.setContextString("Custom Level");
		}
		else
			this.actuator.setContextString("Random - " + this.initialSeed);
	}

	if(!this.loading)
	{
		this.actuate();
		if(!this.isMenu && !this.isEditor)
			window.analytics.boardStart(this.isRandom ? this.initialSeed : this.level+1, this.isRandom, this.setupInitBy);
	}
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function ()
{
	this.isLevel = this.isCustom = this.isRandom = false;
	if(this.customLevelString != null && this.customLevelString != undefined)
	{
		this.isCustom = true;
		this.loading = false;
		this.populateGridFromSimpleString(this.customLevelString);
	}
	else if(this.level != null && this.level != undefined && !isNaN(this.level))
	{
		this.isLevel = true;
		this.loading = false;
		var levelString = this.levels[this.level].lvl;
		this.populateGridFromSimpleString(levelString);
	}
	else
	{
		this.isRandom = true;
		this.actuator.showLoadingMessage();
		this.loading = true;
		
		this.randomlyFillGrid(this.grid, this.seed, this.seedChainCount++);
		
		// solve it?
		this.solver = new Solver(this.grid, 25, this.onSolverFinished, this.onSolverFindAnySolution, this.onSolverProbablyGiveUp, this.initialSeed);
	}
};

GameManager.prototype.randomlyFillGrid = function(grid, seed, chainCount)
{
	// save what seed was
	var seedWas = this.seed;

	// set seed to param
	this.seed = seed;
    
    // crank on the seed a little bit for chaining off initial
    if(chainCount && !isNaN(chainCount))
        for(var i = 0; i < chainCount; ++i)
            var throwaway = this.seededRandom();

    // what was the chained seed result?
    var chainedSeed = this.seed;
    
	// at least 7 tiles, at most 16
	var tilesToAdd = Math.floor(this.seededRandom() * 16); 
	if(tilesToAdd < 7)
		tilesToAdd = 7;

	// ad
	this.addTilesToMeetFillCount(tilesToAdd, grid);

	// 4, 5, or 6 walls
	var numWalls = Math.round(4 + this.seededRandom()*2);
	for (var i = 0; i < numWalls; ++i)
		this.addRandomPosTileOfValue(0, grid);

	// restore seed
	this.seed = seedWas;
    
    // return the chained seed
    return chainedSeed
};

GameManager.prototype.handleSolverSaysImpossible = function(seed)
{
    // make a new grid
    this.grid = new Grid(this.size);
    
    // add start tiles!
    this.addStartTiles();
};

GameManager.prototype.onSolverProbablyGiveUp = function (solver)
{
	// clear the board and start again
};

GameManager.prototype.onSolverFindAnySolution = function (solver)
{
	if(solver.bestSolution && solver.bestSolution.movesTaken)
	{
		var gold = solver.bestSolution.movesTaken.length+1;
		window.gm.actuator.setMedalNumbers(gold, gold, gold, false);
	}
	else
		window.gm.actuator.setMedalNumbers("--", "--", "--");

	if(window.gm.loading)
	{
		window.gm.actuator.clearMessage();
		window.gm.actuate();
		window.gm.actuator.setContextString("(Solving) Random - " + window.gm.initialSeed);
		window.gm.loading = false;
		window.analytics.boardStart(window.gm.isRandom ? window.gm.initialSeed : window.gm.level+1, window.gm.isRandom, window.gm.setupInitBy);
	}
};

GameManager.prototype.onSolverFinished = function (solver)
{
	window.gm.actuator.setContextString("Random - " + window.gm.initialSeed);
	if(!solver.bestSolution || !solver.bestSolution.movesTaken || solver.bestSolution.movesTaken.length == 0)
	{
		window.gm.solver = null;
		//window.gm.keepPlaying(true);
        window.gm.handleSolverSaysImpossible();
	}
	else
	{
		var gold = solver.bestSolution.movesTaken.length+1;
		window.gm.actuator.setMedalNumbers(gold, gold, gold, true);
		window.gm.loading = false;

		// pre-solve the next one
		//window.gm.preSolve(window.gm.initialSeed + 1);
	}
};

GameManager.prototype.findLowestSplittableTileAndSplit = function ()
{
	var lowest = 10000;
	var lowestTile;
	for (var x = 0; x < this.grid.size; x++)
	{
		for (var y = 0; y < this.grid.size; y++)
		{
			var tile = this.grid.cells[x][y];
			if (tile)
			{
				if (tile.value < lowest && tile.value > 2)
				{
					lowestTile = tile;
					lowest = tile.value;
				}
			}
		}
	}

	if (lowestTile)
	{
		var val = lowestTile.value;
		this.grid.removeTile(lowestTile);
		this.addRandomPosTileOfValue(val / 2);
		this.addRandomPosTileOfValue(val / 2);
	}
};

GameManager.prototype.addTilesToMeetFillCount = function (fillCount, grid)
{
	// start with just 1 tile
	var valuesGonnaAdd = [65536];
	var numTwos = 0;

	// split random values in half until achieve fill count
	for(var i = 0; i < fillCount-1; ++i)
	{
		var pos = Math.floor(this.seededRandom() * valuesGonnaAdd.length);
		
		// pick a random value to remove
		var val = valuesGonnaAdd[pos];
		valuesGonnaAdd.splice(pos, 1);

		// keep two's separate so we don't try to split them
		if(val == 4)
		{
			numTwos += 2;
		}
		else
		{
			valuesGonnaAdd.push(val/2);
			valuesGonnaAdd.push(val/2);
		}
	}

	// add the non-twos
	for(var i = 0; i < valuesGonnaAdd.length; ++i)
		this.addRandomPosTileOfValue(valuesGonnaAdd[i], grid);

	// add the twos
	for(var i = 0; i < numTwos; ++i)
		this.addRandomPosTileOfValue(2, grid);
};

GameManager.prototype.addTilesToMeetBudget = function (budget)
{
	// prefer to split large numbers
	var odds = Math.max(0.4, budget / this.startingBudget);
	var rnd = this.seededRandom();
	var shouldSplit = rnd <= odds;
	if (budget == 2 || !shouldSplit)
	{
		this.addRandomPosTileOfValue(budget);
		return 1;
	}
	else
	{
		var added = 0;
		added += this.addTilesToMeetBudget(budget / 2);
		added += this.addTilesToMeetBudget(budget / 2);
		return added;
	}
};

GameManager.prototype.addRandomPosTileOfValue = function (value, grid)
{
	if(!grid)
		grid = this.grid;
	var pos = grid.randomAvailableCell(this.seededRandom());
	if(pos)
	{
		var tile = new Tile(pos, value);
		grid.insertTile(tile);
	}
};

GameManager.prototype.addRandomTilePair = function ()
{
	if (this.grid.cellsAvailable())
	{
		var chance = this.seededRandom();
		var value = 0;
		if (chance < 0.3)
			value = 0;
		else if (chance < 0.9)
			value = 2;
		else
			value = 4;

		for (var i = 0; i < 2; ++i)
		{
			var tile = new Tile(this.grid.randomAvailableCell(), value);
			this.grid.insertTile(tile);
		}
	}
}

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function ()
{
	if (this.grid.cellsAvailable())
	{
		var chance = this.seededRandom();
		var value = 0;
		if (chance < 0.5)
			value = 0;
		else if (chance < 0.9)
			value = 2;
		else
			value = 4;
		var tile = new Tile(this.grid.randomAvailableCell(), value);
		this.grid.insertTile(tile);
	}
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  if (this.storageManager.getBestScore(this.initialSeed) < this.score) {
    this.storageManager.setBestScore(this.levelIdentifier, this.score);
  }

  // Clear the state when the game is over (game over only, not win)
  //if (this.over) {
    //this.storageManager.clearGameState();
  //} else {
    //this.storageManager.setGameState(this.serialize());
  //}

  this.actuator.actuate(this.grid, {
    score:      this.score,
    over:       this.over,
    won:        this.won,
    bestScore:  this.storageManager.getBestScore(this.levelIdentifier),
	bestMoves:  this.storageManager.getBestMovesToComplete(this.levelIdentifier),
    terminated: this.isGameTerminated(),
	moves: this.movesTaken,
	highest: this.highestTileMade,
	perfect: this.getPerfectScoreForCurrent(),
	seed: this.initialSeed,
	medalLevel: this.medalLevelForCurrentMovesAndLevel(),
  });

};

// Represent the current game as an object
GameManager.prototype.serialize = function () {
  return {
    grid:        this.grid.serialize(),
    score:       this.score,
    over:        this.over,
    won:         this.won,
  };
};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell)
{
	if (tile.value == 0)
		return;
	this.grid.cells[tile.x][tile.y] = null;
	this.grid.cells[cell.x][cell.y] = tile;
	tile.updatePosition(cell);
};

//
GameManager.prototype.editorClick = function (data)
{
	if(!this.isEditor)
		return;

	var rightClick = data.isRightClick;
	var pos = data.pos; 
	var tile = this.grid.cellContent(pos);
	if(tile)
	{
		var newValue = tile.value;
		if(tile.value == 0)
			newValue = rightClick ? -1 : 2;
		else
			newValue = rightClick ? tile.value/2 : tile.value * 2;
		
		if(newValue > 65536)
			newValue = 65536;
		
		// trying to remove a wall
		if(newValue < 0)
		{
			this.grid.removeTile(tile);
		}
		else
		{
			if(newValue == 1) // might have divided down to 1
				newValue = 0;

			tile.value = newValue;
		}
	}
	else
	{
		if(!rightClick)
		{
			var tile = new Tile(pos, 0);
			this.grid.insertTile(tile);
		}
	}
	this.prepareTiles();
	this.levelIdentifier = this.getGridAsSimpleString();
	this.actuator.setBoardString(this.levelIdentifier);
	this.actuate();
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction)
{
	// 0: up, 1: right, 2: down, 3: left
	var self = this;

	if (this.isGameTerminated()) return; // Don't do anything if the game's over

	var cell, tile;

	var vector = this.getVector(direction);
	var traversals = this.buildTraversals(vector);
	var moved = false;

	// Save the current tile positions and remove merger information
	this.prepareTiles();

	// Traverse the grid in the right direction and move tiles
	traversals.x.forEach(function (x)
	{
		traversals.y.forEach(function (y)
		{
			cell = { x: x, y: y };
			tile = self.grid.cellContent(cell);

			if (tile)
			{
				var positions = self.findFarthestPosition(cell, vector);
				var next = self.grid.cellContent(positions.next);

				// Only one merger per row traversal?
				if (next && next.value === tile.value && tile.value != 0 && !next.mergedFrom)
				{
					var merged = new Tile(positions.next, tile.value * 2);
					merged.mergedFrom = [tile, next];

					if (merged.value > self.highestTileMade)
					{
						self.highestTileMade = merged.value;
						self.highestTileMadeAtMove = self.movesTaken + 1;
					}

					self.grid.insertTile(merged);
					self.grid.removeTile(tile);

					// Converge the two tiles' positions
					tile.updatePosition(positions.next);

					// Update the score
					self.score += merged.value;
				} 
				else
				{
					self.moveTile(tile, positions.farthest);
				}

				if (!self.positionsEqual(cell, tile))
				{
					moved = true; // The tile moved from its original cell!
				}
			}
		});
	});

	if (moved)
	{
		//
		this.movesTaken++;
		if (this.addTilesOnMove)
			this.addRandomTile();

		if (this.winWhenSingleTile && this.singleTileLeft())
		{
			var bestMoves = this.storageManager.getBestMovesToComplete(this.levelIdentifier);
			if(bestMoves > this.movesTaken || bestMoves == 0)
			{
				this.storageManager.setBestMovesToComplete(this.levelIdentifier, this.movesTaken);
			}
			if(this.isInfinity)
			{
				this.storageManager.setHighestRandomCompleted(this.initialSeed);
				this.presolveManager.onUserHighestInfinityChanges();
			}
			this.won = true; // Game over!
			window.analytics.levelScore(this.isRandom ? this.initialSeed : this.level+1, this.isRandom, this.medalLevelForCurrentMovesAndLevel(), this.movesTaken);
		}
		else if (!this.movesAvailable() || this.movesTaken >= this.maxMovesCurrentLevel())
		{
			this.over = true; // Game over!
			window.analytics.levelLost(this.isRandom ? this.intialSeed : this.level+1, this.isRandom);
		}
	}

	this.actuate();
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0,  y: -1 }, // Up
    1: { x: 1,  y: 0 },  // Right
    2: { x: 0,  y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.grid.withinBounds(cell) &&
           this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

GameManager.prototype.singleTileLeft = function() {
  var self = this;

  var tile;
  var count = 0;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile && tile.value >= 2) {
        count++;
		if(count >= 2)
			return false;
      }
    }
  }

  return true;
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile && tile.value >= 2) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };

          var other  = self.grid.cellContent(cell);

          if (other && other.value === tile.value) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};

GameManager.prototype.getGridAsSimpleString = function()
{
	var plainoutput = "";
	for (var x = 0; x < this.grid.size; x++) 
		for (var y = 0; y < this.grid.size; y++)
			plainoutput += this.grid.cells[x][y] ? (this.grid.cells[x][y].value == 0 ? 0 : (Math.log(this.grid.cells[x][y].value) / Math.LN2).toString(16) ) : "X";
	return plainoutput;
};

GameManager.prototype.getGridAsJSONString = function()
{
	var jsoutput = "[";
	for (var x = 0; x < this.grid.size; x++) 
	{
		jsoutput += "[";
		for (var y = 0; y < this.grid.size; y++) 
		{
			jsoutput += "" + (this.grid.cells[x][y] ? this.grid.cells[x][y].value : "null");
			if(y + 1 < this.grid.size)
				jsoutput += ",";
		}
		jsoutput += "]";
		if(x + 1 < this.grid.size)
			jsoutput += ",";
	}
	jsoutput += "]";
	return jsoutput;
};

GameManager.prototype.populateGridFromSimpleString = function(simpleString)
{
	// 0X65060566076XXX
	this.grid = new Grid(this.size);
	for(var i = 0; i < simpleString.length; ++i)
	{
		var pos = {x: Math.floor(i / this.grid.size), y: i % this.grid.size}; 
		var char = simpleString.charAt(i);
		var asInt = parseInt(char,16);
		if(isNaN(asInt))
		{
			continue;
		}
		else
		{
			var tile = new Tile(pos, asInt == 0 ? 0 : Math.pow(2, asInt));
			this.grid.insertTile(tile);
		}
	}
};

GameManager.prototype.populateGridFromArray = function(levelVals)
{
	for(var x = 0; x < this.grid.size; ++x)
	{
		for(var y = 0; y < this.grid.size; ++y)
		{
			if(levelVals[x][y] != null)
			{
				var tile = new Tile({x: x, y: y}, levelVals[x][y]);
				this.grid.insertTile(tile);
			}
		}
	}
};

GameManager.prototype.price = function(levelNum)
{
	var level = this.levels[levelNum];
	return level.price;
};

GameManager.prototype.currentLevelHasBeenBeaten = function()
{
	var bestMoves = this.storageManager.getBestMovesToComplete(this.levelIdentifier);
	if(bestMoves == 0)
		return false;

	// if solver still solving
	var fixedLevel = !(this.level == null || this.level == undefined || this.level < 0 || isNaN(this.level));
	var medalLevel = 0;
	if(fixedLevel)
	{
		medalLevel = this.medalLevel(this.level);
	}
	else if (this.solver && this.solver.bestSolution)
	{
		var gold = this.solver.bestSolution.movesTaken.length+1;
		if(bestMoves <= gold)
			medalLevel = 3;
	}
	
	return medalLevel > 0;
};

GameManager.prototype.maxMovesCurrentLevel = function()
{
	if(this.level == null || this.level == undefined || this.level < 0 || isNaN(this.level))
	{
		if(this.solver)
		{
			if(this.solver.bestSolution.movesTaken && this.solver.bestSolution.movesTaken.length > 0)
				return this.solver.bestSolution.movesTaken.length+1;
			else
				return 1000;
		}
	}	
	else
	{
		var level = this.levels[this.level];
		if(level)
			return level.bronze;
	}
};

GameManager.prototype.medalLevelForCurrentMovesAndLevel = function()
{
	var level = this.levels[this.level];
	var bestMoves = this.movesTaken;
	if(level != null && level != undefined)
	{
		if(bestMoves == 0)
			return 0;
		else if(bestMoves < level.gold)
			return 4;
		else if(bestMoves == level.gold)
			return 3;
		else if(bestMoves <= level.silver)
			return 2;
		else if(bestMoves <= level.bronze)
			return 1;
		else
			return 0;
	}
	else if(this.solver && this.solver.bestSolution)
	{
		var gold = this.solver.bestSolution.movesTaken.length+1;
		var silver = gold;
		var bronze = gold;
		if(bestMoves == 0)
			return 0;
		else if(bestMoves < gold)
			return 4;
		else if(bestMoves == gold)
			return 3;
		else if(bestMoves <= silver)
			return 2;
		else if(bestMoves <= bronze)
			return 1;
		else
			return 0;
	}
	else
		return 0;
}

GameManager.prototype.unlockAll = function()
{
	console.log("unlocking all");
	for(var i = 0; i < window.gm.levels.length; ++i)
	{
		console.log(window.gm.levels[i].lvl);
		window.gm.storageManager.setBestMovesToComplete(window.gm.levels[i].lvl, window.gm.levels[i].perfect);
	}
};

GameManager.prototype.medalLevel = function(levelNum)
{
	var level = this.levels[levelNum];
	if(level != null && level != undefined)
	{
		var bestMoves = this.storageManager.getBestMovesToComplete(level.lvl);
		if(bestMoves == 0)
			return 0;
		else if(bestMoves < level.gold)
			return 4;
		else if(bestMoves == level.gold)
			return 3;
		else if(bestMoves <= level.silver)
			return 2;
		else if(bestMoves <= level.bronze)
			return 1;
		else
			return 0;
	}
};

GameManager.prototype.getPerfectScoreForCurrent = function()
{
	var level = this.levels[this.level];
	var bestMoves = this.movesTaken;
	if(level != null && level != undefined)
	{
		return level.perfect;
	}
	else if(this.solver && this.solver.bestSolution)
	{
		return this.solver.bestSolution.movesTaken.length;
	}
	
	else return 1;
};

"use client";

import { useState, useEffect, useRef, createElement } from "react";
import styles from "./Game.module.css";
import { Good, Normal, Ready, Wrong } from "../Icons";
import * as BrandIcons from "../brands";
import * as WrongIcons from "../wrongs";
import { createRoot } from "react-dom/client";
import { LeaderboardEntry } from "../utils/googleSheetsService";

enum InteractionState {
  Normal,
  Ready,
  Wrong,
  Good,
}

export default function Game() {
  // State
  const [gameState, setGameState] = useState<"start" | "playing" | "gameOver">(
    "start"
  );
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [finalScore, setFinalScore] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
  const [interactionState, setInteractionState] = useState<InteractionState>(
    InteractionState.Normal
  );
  const interactionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInteractionLockedRef = useRef<boolean>(false);
  const [isTooSmall, setIsTooSmall] = useState(false); // State for screen size check
  const [isMobile, setIsMobile] = useState(false); // State for mobile device detection

  // Refs
  const gameScreenRef = useRef<HTMLDivElement>(null);
  const mascotRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement[]>([]);
  const gameLoopIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const itemSpawnIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const nicknameInputRef = useRef<HTMLInputElement>(null);
  const gameStateRef = useRef<"start" | "playing" | "gameOver">("start");
  const scoreRef = useRef<number>(0);
  const nicknameRef = useRef<string>("");

  // Constants
  const ITEM_SPEED = 3;
  const ITEM_SPAWN_RATE = 1000;
  const GOOD_ITEM_CHANCE = 0.7;
  const ITEM_ROTATION_SPEED = 2;
  const INTERACTION_DISTANCE = 200;
  const LEADERBOARD_KEY = "catchGameLeaderboard";

  // Add state for storing brand icons and wrong icons
  const [brandIcons, setBrandIcons] = useState<
    React.FC<BrandIcons.IconProps>[]
  >([]);
  const [wrongIcons, setWrongIcons] = useState<
    React.FC<BrandIcons.IconProps>[]
  >([]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  // Load brand icons and initial leaderboard on mount
  useEffect(() => {
    // Extract all bubble icons from the imported BrandIcons
    const bubbleIcons = Object.entries(BrandIcons)
      .filter(([key]) => key.startsWith("bubble_"))
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(([_, icon]) => icon as React.FC<BrandIcons.IconProps>);

    setBrandIcons(bubbleIcons);

    // Extract all wrong icons from the imported WrongIcons
    const badIcons = Object.entries(WrongIcons)
      .filter(([key]) => key.startsWith("wrong_"))
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(([_, icon]) => icon as React.FC<BrandIcons.IconProps>);

    setWrongIcons(badIcons);

    // Load leaderboard from API
    fetchLeaderboard();

    // Fallback: load from localStorage if API is unavailable
    const storedLeaderboard = localStorage.getItem(LEADERBOARD_KEY);
    if (storedLeaderboard) {
      try {
        setLeaderboard(JSON.parse(storedLeaderboard));
      } catch (e) {
        console.error("Error parsing leaderboard from localStorage:", e);
      }
    }
  }, []);

  // Effect to check screen size and detect mobile
  useEffect(() => {
    const checkSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const mobile = width <= 768 || 'ontouchstart' in window;

      setIsMobile(mobile);
      // On mobile, don't show "too small" message, just adapt the UI
      // On desktop, require minimum 700x700
      setIsTooSmall(!mobile && (width < 700 || height < 700));
    };

    checkSize(); // Initial check
    window.addEventListener("resize", checkSize);

    // Cleanup listener on unmount
    return () => window.removeEventListener("resize", checkSize);
  }, []);

  // Fetch leaderboard from API
  const fetchLeaderboard = async () => {
    try {
      setIsLoadingLeaderboard(true);
      const response = await fetch("/api/leaderboard");

      if (!response.ok) {
        throw new Error("Failed to load leaderboard");
      }

      const data = await response.json();
      if (data.leaderboard) {
        setLeaderboard(data.leaderboard);
        // Cache in localStorage
        localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(data.leaderboard));
      }
    } catch (error) {
      console.error("Error loading leaderboard:", error);
      // Attempt to load from localStorage as fallback if API fails
      const storedLeaderboard = localStorage.getItem(LEADERBOARD_KEY);
      if (storedLeaderboard) {
        try {
          setLeaderboard(JSON.parse(storedLeaderboard));
        } catch (e) {
          console.error("Error parsing leaderboard from localStorage:", e);
        }
      }
    } finally {
      setIsLoadingLeaderboard(false);
    }
  };

  // Save leaderboard to local state and localStorage
  const saveLeaderboard = (board: LeaderboardEntry[]) => {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(board));
    setLeaderboard(board);
  };

  // Add score to leaderboard (local and server)
  const addScoreToLeaderboard = async (name: string, newScore: number) => {
    if (!name) {
      console.error("Attempted to add score with missing nickname.");
      return;
    }

    const newEntry = {
      nickname: name.toUpperCase(),
      score: newScore,
      timestamp: new Date().toISOString(),
    };

    // Always update local state and storage first
    const updatedBoard = [...leaderboard, newEntry].sort(
      (a, b) => b.score - a.score
    );
    saveLeaderboard(updatedBoard);

    // Then try to send to server
    try {
      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nickname: name,
          score: newScore,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `Error sending score to server (${response.status}):`,
          errorText
        );
        // Already saved locally, so we're good
      } else {
        // Optional: Handle successful server response if needed
        try {
          await response.json(); // Consume JSON body even if unused
          // console.log("Successfully sent score to server:", data);
        } catch (jsonError) {
          console.warn(
            "Could not parse server success response as JSON:",
            jsonError
          );
        }
      }
    } catch (error) {
      console.error("Network error sending score to server:", error);
      // Score is already saved locally
    }
  };

  // Handle mascot position based on mouse movement (desktop)
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      gameStateRef.current !== "playing" ||
      !mascotRef.current ||
      !gameScreenRef.current ||
      isMobile
    )
      return;

    const gameRect = gameScreenRef.current.getBoundingClientRect();
    let x = event.clientX - gameRect.left;
    let y = event.clientY - gameRect.top;
    const mascotWidth = mascotRef.current.offsetWidth;
    const mascotHeight = mascotRef.current.offsetHeight;

    // Keep mascot within game bounds
    x = Math.max(
      mascotWidth / 2,
      Math.min(x, gameRect.width - mascotWidth / 2)
    );
    y = Math.max(
      mascotHeight / 2,
      Math.min(y, gameRect.height - mascotHeight / 2)
    );

    mascotRef.current.style.left = `${x - mascotWidth / 2}px`;
    mascotRef.current.style.top = `${y - mascotHeight / 2}px`;

    checkForInteraction();
  };

  // Handle mascot position based on touch movement (mobile)
  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (
      gameStateRef.current !== "playing" ||
      !mascotRef.current ||
      !gameScreenRef.current ||
      !isMobile
    )
      return;

    event.preventDefault(); // Prevent scrolling

    const touch = event.touches[0];
    const gameRect = gameScreenRef.current.getBoundingClientRect();
    let x = touch.clientX - gameRect.left;
    const mascotWidth = mascotRef.current.offsetWidth;
    const mascotHeight = mascotRef.current.offsetHeight;

    // Keep mascot within game bounds horizontally
    x = Math.max(
      mascotWidth / 2,
      Math.min(x, gameRect.width - mascotWidth / 2)
    );

    // Fixed Y position at the bottom
    const y = gameRect.height - mascotHeight / 2 - 20; // 20px from bottom

    mascotRef.current.style.left = `${x - mascotWidth / 2}px`;
    mascotRef.current.style.top = `${y - mascotHeight / 2}px`;

    checkForInteraction();
  };

  // Create a new falling item
  const createItem = () => {
    if (!gameScreenRef.current || gameStateRef.current !== "playing") return;

    const item = document.createElement("div");
    item.classList.add(styles.item);

    const isGood = Math.random() < GOOD_ITEM_CHANCE;
    item.dataset.good = isGood.toString();
    item.dataset.rotation = "0";

    const iconContainer = document.createElement("div");
    iconContainer.style.width = "40px";
    iconContainer.style.height = "40px";
    iconContainer.style.borderRadius = "50%";
    iconContainer.style.display = "flex";
    iconContainer.style.justifyContent = "center";
    iconContainer.style.alignItems = "center";
    item.appendChild(iconContainer);

    const root = createRoot(iconContainer);

    if (isGood && brandIcons.length > 0) {
      const randomIndex = Math.floor(Math.random() * brandIcons.length);
      const BrandIcon = brandIcons[randomIndex];
      root.render(createElement(BrandIcon, { width: 140, height: 140 }));
    } else if (!isGood && wrongIcons.length > 0) {
      const randomIndex = Math.floor(Math.random() * wrongIcons.length);
      const WrongIcon = wrongIcons[randomIndex];
      root.render(createElement(WrongIcon, { width: 140, height: 140 }));
    } else {
      // Fallback SVGs if no icons are loaded - removed for brevity in this example
      // Consider adding a simple text or default shape if icons might fail to load
      iconContainer.innerHTML = isGood ? "✔️" : "❌"; // Simple fallback
    }

    const gameWidth = gameScreenRef.current.offsetWidth;
    const itemWidth = 40; // Assuming item width, adjust if needed
    item.style.left = `${Math.random() * (gameWidth - itemWidth)}px`;
    item.style.top = `-${itemWidth}px`; // Start above screen

    const speedMultiplier = 0.5 + Math.random(); // Random speed variation
    item.dataset.speed = (ITEM_SPEED * speedMultiplier).toString();

    gameScreenRef.current.appendChild(item);
    itemsRef.current.push(item as HTMLDivElement);
  };

  // Check if mascot is near any items
  const checkForInteraction = () => {
    if (
      isInteractionLockedRef.current ||
      !mascotRef.current ||
      itemsRef.current.length === 0
    )
      return;

    const mascotRect = mascotRef.current.getBoundingClientRect();
    const mascotCenterX = mascotRect.left + mascotRect.width / 2;
    const mascotCenterY = mascotRect.top + mascotRect.height / 2;

    let isNearItem = false;
    for (const item of itemsRef.current) {
      const itemRect = item.getBoundingClientRect();
      const itemCenterX = itemRect.left + itemRect.width / 2;
      const itemCenterY = itemRect.top + itemRect.height / 2;

      const distance = Math.sqrt(
        Math.pow(mascotCenterX - itemCenterX, 2) +
          Math.pow(mascotCenterY - itemCenterY, 2)
      );

      if (distance < INTERACTION_DISTANCE) {
        isNearItem = true;
        break;
      }
    }

    // Only update state if it changes to avoid unnecessary re-renders/timer resets
    if (isNearItem && interactionState !== InteractionState.Ready) {
      setInteractionState(InteractionState.Ready);
    } else if (!isNearItem && interactionState !== InteractionState.Normal) {
      setInteractionState(InteractionState.Normal);
    }
  };

  // Update item positions and check collisions
  const updateItems = () => {
    if (
      gameStateRef.current !== "playing" ||
      !gameScreenRef.current ||
      !mascotRef.current
    )
      return;

    const mascotRect = mascotRef.current.getBoundingClientRect();
    const gameHeight = gameScreenRef.current.offsetHeight;

    for (let i = itemsRef.current.length - 1; i >= 0; i--) {
      const item = itemsRef.current[i];
      if (!item) continue; // Safety check

      const currentTop = parseFloat(item.style.top || "0");
      const itemSpeed = parseFloat(item.dataset.speed || ITEM_SPEED.toString());
      item.style.top = `${currentTop + itemSpeed}px`;

      const currentRotation = parseFloat(item.dataset.rotation || "0");
      const newRotation = (currentRotation + ITEM_ROTATION_SPEED) % 360;
      item.style.transform = `rotate(${newRotation}deg)`;
      item.dataset.rotation = newRotation.toString();

      const itemRect = item.getBoundingClientRect();

      // Check collision
      if (
        mascotRect.left < itemRect.right &&
        mascotRect.right > itemRect.left &&
        mascotRect.top < itemRect.bottom &&
        mascotRect.bottom > itemRect.top
      ) {
        handleCollision(item, i);
      } else if (currentTop > gameHeight) {
        // Use currentTop check
        // Item missed (passed bottom edge)
        removeItem(i);
        // Optional: Penalize for missed good items?
        // if (item.dataset.good === 'true') {
        //   setLives(prev => Math.max(0, prev - 1)); // Example penalty
        // }
      }
    }
  };

  // Handle collision with an item
  const handleCollision = (item: HTMLDivElement, index: number) => {
    const isGood = item.dataset.good === "true";

    setInteractionState(
      isGood ? InteractionState.Good : InteractionState.Wrong
    );
    isInteractionLockedRef.current = true; // Lock state during effect

    // Create visual effect
    if (gameScreenRef.current) {
      const effect = document.createElement("div");
      effect.classList.add(styles.effect);
      effect.classList.add(isGood ? styles.goodEffect : styles.badEffect);
      effect.style.left = item.style.left;
      effect.style.top = item.style.top;
      gameScreenRef.current.appendChild(effect);
      setTimeout(() => effect.remove(), 500); // Remove effect after animation
    }

    if (isGood) {
      setScore((prevScore) => prevScore + 10);
    } else {
      setLives((prevLives) => {
        // Check if game is already ending/over before decrementing
        if (gameStateRef.current !== "playing") return prevLives;

        const newLives = prevLives - 1;
        if (newLives <= 0) {
          // Check again and update ref immediately to prevent duplicates
          if (gameStateRef.current === "playing") {
            gameStateRef.current = "gameOver"; // Prevent further endGame triggers
            setTimeout(endGame, 0); // Schedule the actual state change and cleanup
          }
        }
        return newLives;
      });

      // Visual effect for losing a life (shake HUD)
      const hudElement = document.getElementById("hud");
      if (hudElement) {
        hudElement.classList.add(styles.shake);
        setTimeout(() => hudElement.classList.remove(styles.shake), 500);
      }
    }

    removeItem(index); // Remove the collided item

    // Reset interaction state after a short delay
    if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = setTimeout(() => {
      setInteractionState(InteractionState.Normal);
      isInteractionLockedRef.current = false; // Unlock state
      interactionTimerRef.current = null;
    }, 500); // Adjust delay as needed (matches effect duration)
  };

  // Remove an item from the game
  const removeItem = (index: number) => {
    const item = itemsRef.current[index];
    if (item?.parentNode) {
      // Check if item and parentNode exist
      item.parentNode.removeChild(item);
    }
    // Ensure correct removal if indices shift during looping
    if (itemsRef.current[index] === item) {
      itemsRef.current.splice(index, 1);
    } else {
      // If index shifted, find the correct item to remove
      const actualIndex = itemsRef.current.indexOf(item);
      if (actualIndex > -1) {
        itemsRef.current.splice(actualIndex, 1);
      }
    }
  };

  // Start the game
  const startGame = () => {
    const inputElement = nicknameInputRef.current;
    if (!inputElement || inputElement.value.trim().length === 0) {
      if (inputElement) {
        inputElement.style.border = "2px solid red";
      }
      return;
    }
    // Clear potential red border
    if (inputElement) inputElement.style.border = "";

    let currentNickname = inputElement.value.trim().toUpperCase().slice(0, 5);
    if (currentNickname.length === 0) currentNickname = "ANO N"; // Default nickname

    nicknameRef.current = currentNickname; // Update ref
    setScore(0);
    scoreRef.current = 0; // Sync ref
    setLives(3);
    setGameState("playing");
    gameStateRef.current = "playing"; // Sync ref
    setInteractionState(InteractionState.Normal); // Reset mascot state

    // Reset items
    itemsRef.current.forEach((item) => item?.remove()); // Safety check item
    itemsRef.current = [];

    // Position mascot at bottom center for mobile, or center for desktop
    if (isMobile && mascotRef.current && gameScreenRef.current) {
      const gameRect = gameScreenRef.current.getBoundingClientRect();
      const mascotWidth = mascotRef.current.offsetWidth || 80;
      const mascotHeight = mascotRef.current.offsetHeight || 80;
      const x = gameRect.width / 2;
      const y = gameRect.height - mascotHeight / 2 - 20;
      mascotRef.current.style.left = `${x - mascotWidth / 2}px`;
      mascotRef.current.style.top = `${y - mascotHeight / 2}px`;
    }

    // Hide cursor during gameplay (only on desktop)
    if (!isMobile) {
      document.body.style.cursor = "none";
    }

    // Clear any existing intervals before starting new ones
    if (gameLoopIntervalRef.current) clearInterval(gameLoopIntervalRef.current);
    if (itemSpawnIntervalRef.current)
      clearInterval(itemSpawnIntervalRef.current);

    // Start game loops
    gameLoopIntervalRef.current = setInterval(() => {
      updateItems();
      checkForInteraction(); // Check interaction state continuously
    }, 1000 / 60); // ~60 FPS

    itemSpawnIntervalRef.current = setInterval(createItem, ITEM_SPAWN_RATE);

    // Create initial items with slight delay
    for (let i = 0; i < 3; i++) {
      setTimeout(createItem, i * 300);
    }
  };

  // End the game
  const endGame = () => {
    setGameState("gameOver");
    gameStateRef.current = "gameOver"; // Sync ref

    const finalScoreValue = scoreRef.current;
    setFinalScore(finalScoreValue);

    // Stop game loops
    if (gameLoopIntervalRef.current) clearInterval(gameLoopIntervalRef.current);
    if (itemSpawnIntervalRef.current)
      clearInterval(itemSpawnIntervalRef.current);
    gameLoopIntervalRef.current = null;
    itemSpawnIntervalRef.current = null;

    // Clear interaction timer
    if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = null;
    isInteractionLockedRef.current = false; // Ensure unlocked

    // Remove all remaining items
    itemsRef.current.forEach((item) => item?.remove());
    itemsRef.current = [];

    // Add score to leaderboard using the ref value (more reliable)
    addScoreToLeaderboard(nicknameRef.current, finalScoreValue);

    // Fetch updated leaderboard after submission
    fetchLeaderboard();

    // Show cursor again
    document.body.style.cursor = "default";
  };

  // Reset game state to start screen
  const restartGame = () => {
    setGameState("start");
    gameStateRef.current = "start"; // Sync ref
    nicknameRef.current = ""; // Sync ref
    setScore(0);
    scoreRef.current = 0; // Sync ref
    setLives(3);
    setFinalScore(0); // Reset final score display
    setInteractionState(InteractionState.Normal); // Reset mascot

    // Clear the input field value
    if (nicknameInputRef.current) {
      nicknameInputRef.current.value = "";
      nicknameInputRef.current.style.border = ""; // Reset border
    }
  };

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (gameLoopIntervalRef.current)
        clearInterval(gameLoopIntervalRef.current);
      if (itemSpawnIntervalRef.current)
        clearInterval(itemSpawnIntervalRef.current);
      if (interactionTimerRef.current)
        clearTimeout(interactionTimerRef.current);
      // Ensure cursor is reset if component unmounts during game
      if (gameStateRef.current === "playing") {
        document.body.style.cursor = "default";
      }
    };
  }, []);

  // Conditionally render message for small screens
  if (isTooSmall) {
    return (
      <div
        className={styles.gameContainer}
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          padding: "20px",
          textAlign: "center",
        }}
      >
        <h1>По-братски на компике запусти</h1>
      </div>
    );
  }

  return (
    <div className={styles.gameContainer}>
      {/* Start Screen */}
      {gameState === "start" && (
        <div className={styles.screen}>
          <h1>Дропик VS Импортозамещение</h1>
          <label htmlFor="nickname">ВВЕДИТЕ НИКНЕЙМ:</label>
          <input
            ref={nicknameInputRef}
            type="text"
            id="nickname"
            maxLength={5}
            placeholder="XXXXX"
            autoComplete="off"
            onChange={(e) => {
              // Force uppercase and limit length
              e.target.value = e.target.value.toUpperCase().slice(0, 5);
              // Clear red border on valid input
              if (e.target.value.trim().length > 0) {
                e.target.style.border = "";
              }
            }}
            onKeyDown={(e) => {
              // Allow starting game with Enter key
              if (e.key === "Enter") {
                startGame();
              }
            }}
          />
          <button onClick={startGame}>НАЧАТЬ ИГРУ</button>
        </div>
      )}

      {/* Game Screen */}
      {gameState === "playing" && (
        <div
          ref={gameScreenRef}
          className={`${styles.screen} ${styles.gameScreen} ${isMobile ? styles.mobileGameScreen : ""}`}
          onMouseMove={handleMouseMove}
          onTouchMove={handleTouchMove}
          onTouchStart={handleTouchMove}
          // Optionally add onMouseLeave to reset mascot position or state
          // onMouseLeave={() => setInteractionState(InteractionState.Normal)}
        >
          {/* HUD Elements */}
          <div id="hud" className={styles.hud}>
            <div>
              СЧЕТ: <span>{score}</span>
            </div>
            <div>
              ЖИЗНИ: <span>{lives}</span>
            </div>
          </div>

          {/* Leaderboard */}
          <div className={styles.leaderboard}>
            <h2>ЛИДЕРЫ {isLoadingLeaderboard && "⟳"}</h2>
            <ul>
              {leaderboard.slice(0, 10).map((entry, index) => (
                <li key={`${entry.nickname}-${entry.score}-${index}`}>
                  {" "}
                  {/* Better key */}
                  {entry.nickname}: {entry.score}
                </li>
              ))}
              {leaderboard.length === 0 && !isLoadingLeaderboard && (
                <li className={styles.emptyLeaderboard}>Пока никого нет</li>
              )}
              {leaderboard.length === 0 && isLoadingLeaderboard && (
                <li className={styles.emptyLeaderboard}>Загрузка...</li>
              )}
            </ul>
          </div>

          {/* Mascot */}
          <div
            ref={mascotRef}
            className={styles.mascot}
            style={{ position: "absolute" }}
          >
            {" "}
            {/* Ensure position absolute */}
            {interactionState === InteractionState.Ready ? (
              <Ready />
            ) : interactionState === InteractionState.Good ? (
              <Good />
            ) : interactionState === InteractionState.Wrong ? (
              <Wrong />
            ) : (
              <Normal /> // Default state
            )}
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === "gameOver" && (
        <div className={styles.screen}>
          <h1>ПОТРАЧЕНО</h1>
          <p>
            ВАШ СЧЕТ: <span>{finalScore}</span>
          </p>
          <button onClick={restartGame}>ИГРАТЬ СНОВА</button>
        </div>
      )}

      {/* CRT Effect Overlay */}
      <div className={styles.crtOverlay}></div>
    </div>
  );
}

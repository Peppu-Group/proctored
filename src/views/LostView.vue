<template>
    <div class="not-found-container">
      <div class="stars"></div>
      <div class="central-content">
        <!-- Animated 404 text -->
        <h1 class="error-code">
          <span class="digit">4</span>
          <span class="digit digit-middle">0</span>
          <span class="digit">4</span>
        </h1>
        
        <div class="message-container">
          <h2 class="error-message">Oops! Page Not Found</h2>
          <p class="error-description">
            The page or Exam you're looking for has drifted off into space.
          </p>
          
          <!-- Animated space traveler -->
          <div class="space-traveler">
            <div class="astronaut">
              <div class="astronaut-helmet"></div>
              <div class="astronaut-body"></div>
              <div class="astronaut-arm left"></div>
              <div class="astronaut-arm right"></div>
              <div class="astronaut-leg left"></div>
              <div class="astronaut-leg right"></div>
            </div>
          </div>
          
          <!-- Action buttons -->
          <div class="action-buttons">
            <button @click="goBack" class="btn btn-back">
              <i class="arrow-left"></i> Go Back
            </button>
            <button @click="goHome" class="btn btn-home">
              <i class="home-icon"></i> Return Home
            </button>
          </div>
        </div>
      </div>
    </div>
  </template>
  
  <script>
  export default {
    name: 'NotFound',
    methods: {
      goBack() {
        this.$router.go(-1);
      },
      goHome() {
        this.$router.push('/');
      }
    }
  }
  </script>
  
  <style scoped>
  .not-found-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100vh;
    width: 100%;
    overflow: hidden;
    background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
    position: relative;
    color: #fff;
    font-family: 'Inter', 'Roboto', sans-serif;
  }
  
  /* Stars background */
  .stars {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image: 
      radial-gradient(2px 2px at 20px 30px, #eee, rgba(0,0,0,0)),
      radial-gradient(2px 2px at 40px 70px, #fff, rgba(0,0,0,0)),
      radial-gradient(2px 2px at 50px 160px, #ddd, rgba(0,0,0,0)),
      radial-gradient(2px 2px at 90px 40px, #fff, rgba(0,0,0,0)),
      radial-gradient(2px 2px at 130px 80px, #fff, rgba(0,0,0,0)),
      radial-gradient(2px 2px at 160px 120px, #ddd, rgba(0,0,0,0));
    background-repeat: repeat;
    background-size: 200px 200px;
    animation: animateStars 100s linear infinite;
    opacity: 0.3;
  }
  
  @keyframes animateStars {
    from {
      background-position: 0 0;
    }
    to {
      background-position: 0 1000px;
    }
  }
  
  .central-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    z-index: 10;
    padding: 2rem;
    max-width: 800px;
  }
  
  /* 404 Text styling */
  .error-code {
    font-size: 10rem;
    font-weight: 900;
    margin: 0;
    padding: 0;
    line-height: 1;
    letter-spacing: -0.05em;
    background: linear-gradient(120deg, #a5f3fc, #3b82f6, #6366f1);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    position: relative;
    text-shadow: 0px 0px 20px rgba(159, 211, 255, 0.5);
    margin-bottom: 2rem;
  }
  
  .digit {
    display: inline-block;
    position: relative;
    animation: float 6s ease-in-out infinite;
  }
  
  .digit-middle {
    animation-delay: 0.5s;
  }
  
  @keyframes float {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-20px);
    }
  }
  
  .message-container {
    background: rgba(17, 24, 39, 0.7);
    padding: 2rem;
    border-radius: 16px;
    backdrop-filter: blur(10px);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.1);
    max-width: 500px;
  }
  
  .error-message {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 1rem;
    background: linear-gradient(to right, #a5f3fc, #6366f1);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  
  .error-description {
    font-size: 1.2rem;
    margin-bottom: 2rem;
    color: #e5e7eb;
    line-height: 1.6;
  }
  
  /* Astronaut animation */
  .space-traveler {
    position: relative;
    height: 100px;
    width: 100%;
    margin: 2rem 0;
  }
  
  .astronaut {
    position: absolute;
    width: 60px;
    height: 90px;
    left: 50%;
    transform: translateX(-50%);
    animation: float-astronaut 10s ease-in-out infinite;
  }
  
  @keyframes float-astronaut {
    0%, 100% {
      transform: translateX(-50%) translateY(0) rotate(3deg);
    }
    25% {
      transform: translateX(-30%) translateY(-15px) rotate(-5deg);
    }
    50% {
      transform: translateX(-50%) translateY(-25px) rotate(0deg);
    }
    75% {
      transform: translateX(-70%) translateY(-15px) rotate(5deg);
    }
  }
  
  .astronaut-helmet {
    position: absolute;
    top: 0;
    left: 15px;
    width: 30px;
    height: 30px;
    background: #fff;
    border-radius: 50%;
    box-shadow: 0 0 10px rgba(165, 243, 252, 0.7);
  }
  
  .astronaut-body {
    position: absolute;
    top: 25px;
    left: 10px;
    width: 40px;
    height: 45px;
    background: #e5e7eb;
    border-radius: 10px;
  }
  
  .astronaut-arm {
    position: absolute;
    width: 10px;
    height: 30px;
    background: #e5e7eb;
    border-radius: 5px;
  }
  
  .astronaut-arm.left {
    top: 28px;
    left: 2px;
    transform: rotate(20deg);
  }
  
  .astronaut-arm.right {
    top: 28px;
    right: 2px;
    transform: rotate(-20deg);
  }
  
  .astronaut-leg {
    position: absolute;
    width: 10px;
    height: 20px;
    background: #e5e7eb;
    border-radius: 5px;
    bottom: 0;
  }
  
  .astronaut-leg.left {
    left: 17px;
  }
  
  .astronaut-leg.right {
    right: 17px;
  }
  
  /* Button styles */
  .action-buttons {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
    justify-content: center;
    flex-wrap: wrap;
  }
  
  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border: none;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
  
  .btn-back {
    background-color: transparent;
    color: #e5e7eb;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  
  .btn-back:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
  
  .btn-home {
    background: linear-gradient(to right, #3b82f6, #6366f1);
    color: white;
  }
  
  .btn-home:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 10px -1px rgba(59, 130, 246, 0.4);
  }
  
  /* Icons */
  .arrow-left::before {
    content: "";
    display: inline-block;
    width: 0.75rem;
    height: 0.75rem;
    border-left: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: rotate(45deg);
  }
  
  .home-icon::before {
    content: "";
    display: inline-block;
    width: 1rem;
    height: 0.75rem;
    border: 2px solid currentColor;
    border-top: 0.75rem solid currentColor;
    border-radius: 1px;
  }
  
  /* Responsive adjustments */
  @media (max-width: 768px) {
    .error-code {
      font-size: 7rem;
    }
    
    .error-message {
      font-size: 1.75rem;
    }
    
    .error-description {
      font-size: 1rem;
    }
  }
  
  @media (max-width: 480px) {
    .error-code {
      font-size: 5rem;
    }
    
    .action-buttons {
      flex-direction: column;
      width: 100%;
    }
    
    .btn {
      width: 100%;
      justify-content: center;
    }
  }
  </style>
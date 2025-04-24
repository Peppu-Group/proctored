<script>
import NavBar from '../components/NavBar.vue'
import FooterView from '../components/FooterView.vue'
export default {
    name: 'HomeView',
    components: { NavBar, FooterView },
}
</script>

<template>
  <body class="bod">
  <div id="XXe">
    <NavBar/>
    <!-- Stars background -->
  <div class="stars-background"></div>
  
  <div class="container">
    <!-- Header Section -->
    <header class="header-section">
      <h1 class="heading-title">
        <span>Proctored</span> <span>Peppubuild</span><br>
        <span class="heading-subtitle">Examination Reimagined.</span>
      </h1>
      
      <p class="description">
        Turn your Google Forms and Google Classroom into an examination center. Track cheating with our AI
        feature, monitor tabs, time tests, detect cheating, and get students evaluation after test.
      </p>
      
      <div class="button-container">
        <a href="/app" class="btn btn-primary">Prepare your first test</a>
        <a href="https://calendly.com/ugochi-ukpai-peppubuild/30min" class="btn btn-outline">Speak to our team</a>
      </div>
      
      
      <!-- Dashboard Image -->
      <div class="image-container">
        <div class="image-glow"></div>
        <img src="https://drive.google.com/thumbnail?id=1t6DIgaJx_cKCYKluNVpSKCS9DKoa4hZL&sz=w1000" alt="Peppubuild Dashboard">
      </div>
    </header>
    
    <!-- Features Section -->
    <section class="features-section">
      <h2 class="section-title">Features</h2>
      
      <div class="features-grid">
        <!-- Feature 1 -->
        <div class="feature-card">
          <div class="feature-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
          </div>
          <h3 class="feature-title">Proctoring</h3>
          <p class="feature-description">
            With our AI-Powered proctoring, maintain academic honesty and prevent cheating. Peppubuild offers monitoring for screen activity, webcam feeds, and user behavior in real time.
          </p>
          <a href="/app" class="btn btn-primary">Try Now</a>
        </div>
        
        <!-- Feature 2 -->
        <div class="feature-card">
          <div class="feature-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <h3 class="feature-title">Timed Test</h3>
          <p class="feature-description">
            Ensure fair and structured assessments. Set strict time limits for exams, keeping students focused and preventing unfair advantages. Track and save progress on Google Forms.
          </p>
          <a href="/app" class="btn btn-primary">Try Now</a>
        </div>
        
        <!-- Feature 3 -->
        <div class="feature-card">
          <div class="feature-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 3a2 2 0 0 0-2 2"></path>
              <path d="M19 3a2 2 0 0 1 2 2"></path>
              <path d="M21 19a2 2 0 0 1-2 2"></path>
              <path d="M5 21a2 2 0 0 1-2-2"></path>
              <path d="M9 3h1"></path>
              <path d="M9 21h1"></path>
              <path d="M14 3h1"></path>
              <path d="M14 21h1"></path>
              <path d="M3 9v1"></path>
              <path d="M21 9v1"></path>
              <path d="M3 14v1"></path>
              <path d="M21 14v1"></path>
              <line x1="7" y1="8" x2="17" y2="8"></line>
              <line x1="7" y1="12" x2="17" y2="12"></line>
              <line x1="7" y1="16" x2="17" y2="16"></line>
            </svg>
          </div>
          <h3 class="feature-title">Reporting</h3>
          <p class="feature-description">
            Track exam performance, detect anomalies, and ensure fairness with automated reports. Gain insights into test results and trends, generate reports in multiple formats for easy review.
          </p>
          <a href="/app" class="btn btn-primary">Try Now</a>
        </div>
      </div>
    </section>
    
    <div id="i23gh">
      <div id="accordionFlushExample" class="accordion accordion-flush container col-xxl-8 px-4 py-5">
        <h2 class="pb-2 border-bottom">Frequently Asked Questions (FAQ)</h2>
        <div class="accordion-item">
          <h2 id="flush-headingOne" class="accordion-header header-acc"><button type="button" data-bs-toggle="collapse"
              data-bs-target="#flush-collapseOne" aria-expanded="false" aria-controls="flush-collapseOne"
              class="accordion-button collapsed whitefont">Why Use Proctored by Peppubuild</button></h2>
          <div id="flush-collapseOne" aria-labelledby="flush-headingOne" data-bs-parent="#accordionFlushExample"
            class="accordion-collapse collapse">
            <div class="accordion-body whitefont">
              <p data-start="49" data-end="251">Turn your <strong data-start="59" data-end="74">Google Form</strong> into
                a fully monitored <strong data-start="98" data-end="118">exam environment</strong> with ease! <strong
                  data-start="130" data-end="157">Proctored by Peppubuild</strong> ensures a secure, fair, and data-driven
                testing experience for both educators and students.</p>
              <p data-start="253" data-end="843" id="ins699">✅ <strong data-start="255" data-end="292">Seamless Google
                  Forms Integration</strong> – No need for complicated setups; just connect and start monitoring. Setup
                tests with our AI guide on Google Forms.<br>✅ <strong data-start="366" data-end="388"
                  data-is-only-node="">Affordable Pricing</strong> – Enjoy high-quality proctoring at a fraction of the
                cost of traditional solutions.<br data-start="472" data-end="475">
                ✅ <strong data-start="477" data-end="495">Cancel Anytime</strong> – No long-term commitments; adjust or
                cancel your plan whenever you need.<br data-start="569" data-end="572">
                ✅ <strong data-start="574" data-end="608">Advanced Reporting &amp; Analytics</strong> – Get <strong
                  data-start="615" data-end="636">detailed insights</strong> into each student's performance, including
                strengths, weaknesses, and potential red flags.<br data-start="727" data-end="730">
                ✅ <strong data-start="732" data-end="751">Student Ranking</strong> – Easily compare performance across
                students with automatic ranking based on test scores.</p>
              <p data-start="845" data-end="955">📊 <strong data-start="848" data-end="952">Make better decisions, ensure
                  fairness, and optimize learning outcomes with Proctored by Peppubuild!</strong></p>
            </div>
          </div>
        </div>
        <div class="accordion-item">
          <h2 id="flush-headingTwo" class="accordion-header"><button type="button" data-bs-toggle="collapse"
              data-bs-target="#flush-collapseTwo" aria-expanded="false" aria-controls="flush-collapseTwo"
              class="accordion-button collapsed whitefont">What Monitoring do you Provide</button></h2>
          <div id="flush-collapseTwo" aria-labelledby="flush-headingTwo" data-bs-parent="#accordionFlushExample"
            class="accordion-collapse collapse">
            <div class="accordion-body whitefont">
              <p data-start="48" data-end="190"><strong data-start="48" data-end="75">Proctored by Peppubuild</strong>
                ensures exam integrity with <strong data-start="104" data-end="141">comprehensive monitoring
                  features</strong> that detect and prevent cheating in real time.</p>
              <p data-start="192" data-end="725">✅ <strong data-start="194" data-end="215">Screen Monitoring</strong> –
                Track student activity to prevent switching tabs or using unauthorized resources.<br data-start="299"
                  data-end="302">
                ✅ <strong data-start="304" data-end="327" data-is-only-node="">Camera Surveillance</strong> – Capture live
                webcam feeds to verify student identity and detect suspicious movements.<br data-start="415"
                  data-end="418">
                ✅ <strong data-start="420" data-end="439">Audio Detection</strong> – Identify background noise or external
                assistance during the exam.<br data-start="507" data-end="510">
                ✅ <strong data-start="512" data-end="540">Auto Recording &amp; Storage</strong> – Save exam sessions for
                later review and auditing.<br data-start="592" data-end="595">
                ✅ <strong data-start="597" data-end="629">AI-Powered Anomaly Detection</strong> – Get alerts for unusual
                behaviors like multiple faces, distractions, or extended inactivity.</p>
              <p data-start="727" data-end="860">With <strong data-start="732" data-end="759">Proctored by
                  Peppubuild</strong>, you get <strong data-start="769" data-end="802">full control and
                  transparency</strong>, ensuring <strong data-start="813" data-end="845">fair, distraction-free
                  exams</strong> every time!&nbsp;</p>
            </div>
          </div>
        </div>
        <div class="accordion-item">
          <h2 id="flush-headingThree" class="accordion-header"><button type="button" data-bs-toggle="collapse"
              data-bs-target="#flush-collapseThree" aria-expanded="false" aria-controls="flush-collapseThree"
              class="accordion-button collapsed whitefont">What Features does the Free Plan Offer</button></h2>
          <div id="flush-collapseThree" aria-labelledby="flush-headingThree" data-bs-parent="#accordionFlushExample"
            class="accordion-collapse collapse">
            <div class="accordion-body whitefont">
              <p data-start="55" data-end="232">Our <strong data-start="59" data-end="78">7-day free plan</strong> gives
                you access to <strong data-start="99" data-end="115">all features</strong> so you can experience <strong
                  data-start="138" data-end="165">Proctored by Peppubuild</strong> without limitations! However, there are
                some usage restrictions:</p>
              <p data-start="234" data-end="566">✅ <strong data-start="236" data-end="259">Full Feature Access</strong> –
                Enjoy proctoring, monitoring, reporting, and analytics for 7 days.<br data-start="328" data-end="331">
                ✅ <strong data-start="333" data-end="355" data-is-only-node="">One Published Test</strong> – Create and
                launch <strong data-start="376" data-end="383">one</strong> monitored exam.<br data-start="399"
                  data-end="402">
                ✅ <strong data-start="404" data-end="425">Up to 10 Students</strong> – Conduct exams for a maximum of
                <strong data-start="459" data-end="477">10 test-takers</strong>.<br data-start="478" data-end="481">
                ✅ <strong data-start="483" data-end="507">Unlimited Demo Forms</strong> – Test the system as much as you
                want before going live.
              </p>
              <p data-start="568" data-end="778">🔔 <strong data-start="571" data-end="592">Upgrade for More!</strong>
                After 7 days, your <strong data-start="612" data-end="646">feature access will be revoked</strong> unless
                you upgrade to a paid plan. Unlock <strong data-start="689" data-end="748">more tests, unlimited students,
                  and advanced monitoring</strong> with our affordable plans!</p>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
    <FooterView/>
</div>
</body>
</template>

<style scoped>
.accordion-button,
.accordion-button:not(.collapsed),
.accordion-body {
  background-color: black
}
.whitefont {
  color: white !important;
}

</style>
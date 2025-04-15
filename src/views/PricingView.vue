<template>
    <body>
    <NavBar />
    <div id="UXoi" class="gjs-row">
        <div id="iizvji" class="gjs-cell">
            <div id="7Vj9"><b>Our Pricing Plan</b></div>
            <div id="TNG" class="gjs-row">
                <div id="iy5y9p" class="gjs-cell">
                    <div id="Tp0">Coming soon .....</div>
                </div>
            </div>
            <FooterView />
        </div>
    </div>
</body>
</template>

<script>
import NavBar from '../components/NavBar.vue'
import FooterView from '../components/FooterView.vue'

export default {
    name: 'PricingView',
    components: { NavBar, FooterView },
}
</script>

<style scoped>
body {
  font-family: 'Inter', 'Roboto', 'Arial', sans-serif;
  color: #fff;
  overflow-x: hidden;
  background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
  position: relative;
  min-height: 100vh;
}
</style>
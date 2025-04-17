import { createRouter, createWebHistory } from 'vue-router'
import store from '../store'
import HomeView from '../views/HomeView.vue'
import ExamView from '../views/ExamView.vue'
import FormLink from '../views/FormLink.vue'
import LoginView from '../views/LoginView.vue'
import LostView from '../views/LostView.vue'
import MailView from '../views/MailView.vue'
import SuccessView from '../views/SuccessView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView
    },
    {
      path: '/getmail/:id/:time',
      name: 'getmail',
      component: MailView
    },
    {
      path: '/success',
      name: 'success',
      component: SuccessView
    },
    {
      path: '/exam/:id', name: 'exam', component: ExamView,

    },
    {
      path: '/form-link', name: 'formlink', component: FormLink, meta: { requiresAuth: true }
    },
    {
      path: '/contact',
      name: 'contact',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/ContactView.vue')
    },
    {
      path: '/privacy',
      name: 'privacy',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/PrivacyView.vue')
    },
    {
      path: '/terms',
      name: 'terms',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/TermsView.vue')
    },
    {
      path: '/app',
      name: 'dashboard',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/DashboardView.vue'),
      meta: { requiresAuth: true }
    },
    // Catch-all 404 route (keep this LAST)
    {
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      component:LostView
    }
  ]
})

// Global navigation guard
router.beforeEach((to, from, next) => {
  const isLoggedIn = store.state.accessToken; // assumes boolean in Vuex state
  if (to.matched.some(record => record.meta.requiresAuth)) {
    if (!isLoggedIn) {
      next('/login');
    } else {
      next();
    }
  } else {
    next();
  }
});

export default router

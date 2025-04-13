<template>
    <div class="container-fluid">
        <div class="row">
            <SideBar/>
            <div class="col-10">
                <div class="quiz-header p-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <input type="text" class="form-control w-25" placeholder="Type to search...">

                        <button @click="addQuiz()" class="btn btn-sm btn-add-quiz"><i class="bi bi-plus"></i>Create new
                            Quiz</button>

                    </div>
                </div>
                <div class="p-3">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Quiz name</th>
                                <th>Duration</th>
                                <th>Details</th>
                                <th>Sharing & Stats</th>
                                <th>End Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="quiz in quizList" :key="quiz.form" @click="getLink(quiz.form, quiz.name, quiz.time)">
                                <td>{{ quiz.name }}</td>
                                <td>{{ quiz.time }} min<br>{{ quiz.start ?  quiz.start: 'Start at any time'}}</td>
                                <td>{{ quiz.type }}<br>{{ formatDate(quiz.date) }}</td>
                                <td>{{ quiz.sharing ? quiz.sharing : 'Anyone can take test' }}</td>
                                <td>{{ quiz.end ? quiz.end: 'Take Quiz at any time' }} </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import SideBar from '../components/SideBar.vue'
import { createQuiz } from '@/utils/swalQuiz';

export default {
    name: 'DashboardPage',
    components: { SideBar },

    computed: {
        quizList() {
            return this.$store.getters.quizList;
        }
    },
    mounted() {
        this.$store.dispatch('loadQuizList'); // Load quiz list on component mount
    },

    methods: {
        formatDate(date) {
            return new Date(date).toLocaleDateString("en-US", {
                day: "numeric",
                month: "long",
                year: "numeric"
            });
        },
        getLink(id, name, time) {
            this.$router.push({ path: '/form-link', query: { id } });
        },
        async addQuiz() {
            createQuiz();            
        }
    }
}

</script>

<style scoped>
body {
    background-color: #f4f4f4;
    font-family: 'Arial', sans-serif;
}

.sidebar {
    background-color: #2c3e5e;
    height: 100vh;
    color: white;
}
.quiz-header {
    background-color: white;
    border-bottom: 1px solid #e0e0e0;
}

.progress {
    height: 10px;
    margin-bottom: 10px;
}

.table-hover tbody tr:hover {
    background-color: rgba(0, 0, 0, 0.075);
}

.btn-add-quiz {
    background-color: #10b981;
    color: white;
}
</style>
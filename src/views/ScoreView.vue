<template>
    <div class="container-fluid">
        <div class="row">
            <SideBar />
            <div class="col-10">
                <div class="quiz-header p-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <input type="text" class="form-control w-25" placeholder="Type to search...">

                        <button @click="addQuiz()" class="btn btn-sm btn-add-quiz"><i class="bi bi-plus"></i>Create new
                            Quiz</button>

                    </div>
                </div>
                <div class="alert alert-warning d-flex alert-dismissible fade show align-items-center" role="alert">
                    <div>
                        <h3>Quiz Ongoing</h3>
                        This exam may still be ongoing. This could be because an end date wasn't set in this platform. If
                        You
                        already set an end date from Google Form, ignore this alert. Else, set an end date or wait until the
                        exam ends, to avoid skewed results. Learn more about the importance of setting an exam end date.
                        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                    </div>
                </div>
                <div class="p-3">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Basic 5 Quiz</th>
                                <th>Full Name</th>
                                <th>Email Address</th>
                                <th>Violations</th>
                                <th>Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(row, index) in scoreList" :key="index">
                                <td></td>
                                <td>{{ row[1] }}<br><span :class="{
                                    'status-dot': true,
                                    'green': row[2] == 'Finished',
                                    'red': row[2] == 'Pending'
                                }"></span>{{ row[2] }}</td>
                                <td>{{ row[0] }}</td>
                                <td><span :class="{
                                    'status-dot': true,
                                    'green': row[3] <= 2,
                                    'red': row[3] > 2
                                }"></span>{{ row[3] }}</td>
                                <td>{{ row[4] || 'Quiz mode not set' }} </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import SideBar from '../components/SideBar.vue';
import axios from 'axios';
import { createQuiz } from '@/utils/swalQuiz';

export default {
    name: 'ScoreView',
    components: { SideBar },

    data() {
        return {
            scoreList: null
        };
    },

    async mounted() {
        // get score from axios. we should consider encrypting the name in the route so users can't get score of other students.
        let name = this.$route.query.name;
        if (name) {
            try {
                let res = await axios.post(`${serverUrl}/get-score/${name}`)
                if (res) {
                    this.scoreList = res;
                }
            } catch {
                Swal.fire('Test Unavailable!', 'We cannot access this test score, could be your network', 'error');
            }
        } else {
            this.$router.push({ name: 'NotFound' })
        }
    },

    methods: {
        async addQuiz() {
            createQuiz();
        }
    }
}
</script>

<style scoped>
.sidebar {
    background-color: #2c3e5e;
    height: 100vh;
    color: white;
}

.table-hover tbody tr:hover {
    background-color: rgba(0, 0, 0, 0.075);
}

.btn-add-quiz {
    background-color: #10b981;
    color: white;
}

.status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
    vertical-align: middle;
}

.green {
    background-color: #00c851;
    /* or #4caf50 */
}

.red {
    background-color: #ec590b;
    /* or #f44336 */
}
</style>
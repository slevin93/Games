<script setup lang="ts">
const { data } = await useFetch('/api/hello')

</script>

<template>
  <h1>Index page</h1>

  <div class="box">
    <div v-for="image in data.images">
      <a :href="'colouring/'+image"><img class="box" :src="'images/'+image" /></a>
    </div>
  </div>
</template>

<style>
.box {
  display: flex;
  align-items: center;
  justify-content: center;
}

.box img {
  width: 250px;
  height: 250px;
  border: 1px solid gray;
  border-radius: 15px;
  box-shadow: 0px 0px 4px 0px black;
  aspect-ratio: 9/6 auto;
  margin: 15px;
}
</style>
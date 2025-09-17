<script setup lang="ts">
const { data } = await useFetch('/api/hello')
</script>

<template>
  <h1>Index page</h1>

  <pre>{{ data }}</pre>
</template>
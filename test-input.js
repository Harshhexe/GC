import React, { useState } from 'react';
import { TextInput, Text, View } from 'react-native';

export default function Test() {
  const [text, setText] = useState('hello @world');
  return (
    <View style={{ flex: 1, paddingTop: 50 }}>
      <TextInput
        style={{ borderWidth: 1, padding: 10, fontSize: 16 }}
        onChangeText={setText}
      >
        <Text>{text.split('@')[0]}</Text>
        <Text style={{ color: 'blue', backgroundColor: 'lightblue' }}>@{text.split('@')[1]}</Text>
      </TextInput>
    </View>
  );
}

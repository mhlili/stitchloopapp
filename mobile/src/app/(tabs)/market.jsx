import { useCallback, useState } from 'react';
import {
  View, Text, Image, FlatList, Pressable, StyleSheet, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '../../lib/api';

export default function Market() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setListings(await api('/listings'));
    } catch (err) {
      Alert.alert('Could not load the market', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever this tab comes into view
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function confirmPurchase(listing) {
    Alert.alert(
      'Buy this item?',
      `${listing.item_name} for $${listing.price.toFixed(2)} from @${listing.seller}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Buy', onPress: () => purchase(listing) },
      ]
    );
  }

  async function purchase(listing) {
    try {
      await api(`/listings/${listing.listing_id}/purchase`, { method: 'POST' });
      setListings((prev) => prev.filter((l) => l.listing_id !== listing.listing_id));
      Alert.alert('Purchased', `${listing.item_name} is now in your wardrobe.`);
    } catch (err) {
      // e.g. "Listing is no longer available" from the stored procedure
      Alert.alert('Purchase failed', err.message);
      load();
    }
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={listings}
      numColumns={2}
      keyExtractor={(l) => String(l.listing_id)}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      ListEmptyComponent={!loading && (
        <Text style={styles.empty}>Nothing is for sale yet. Check back after people list items.</Text>
      )}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => confirmPurchase(item)}>
          {item.image_url
            ? <Image source={{ uri: item.image_url }} style={styles.image} resizeMode="contain" />
            : <View style={[styles.image, styles.noImage]} />}
          <Text style={styles.name} numberOfLines={1}>{item.item_name}</Text>
          <Text style={styles.price}>${item.price.toFixed(2)}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: '#fff' },
  content: { padding: 12 },
  card: { flex: 1, margin: 6, maxWidth: '50%' },
  image: { width: '100%', aspectRatio: 1 },
  noImage: { backgroundColor: '#eee' },
  name: { fontWeight: '600', marginTop: 6 },
  price: { color: '#555' },
  empty: { textAlign: 'center', marginTop: 48, color: '#555', paddingHorizontal: 24 },
});
